import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordChatLog } from "@/lib/f2/chatLog";
import { notifyAiOutage } from "@/lib/f2/notifyOutage";
import {
  recordInferenceFailure,
  recordInferenceSuccess,
  shouldAttemptInference,
  type OutageInfo,
} from "@/lib/f2/outage";
import { answerQuestion, ValidationError } from "@/lib/f2/tutor";

/**
 * S3 AIチャットのAPI（F2）。ゲストの利用は proxy.ts で403ガード済み。
 * 2026-07-03 監査指摘#9の修正: 入力起因のエラー（ValidationError）だけを400にし、
 * サーバー都合のエラー（設定不備・推論失敗）は内部メッセージを生徒に見せず
 * 定型文の500を返す。
 *
 * **推論停止時の静的教材モード（F2②・2026-09-04）**:
 * 連続失敗が閾値に達すると停止中になり、以後は推論を呼ばず 503 + 停止情報を返す。
 * 画面はこれを受けて教材への案内に切り替わる。詳細は `src/lib/f2/outage.ts`。
 */

/** サーバー側の推論タイムアウト（画面仕様書S3「10秒でタイムアウト」）。停止判定の失敗に数える */
const INFERENCE_TIMEOUT_MS = 10_000;

/**
 * 応答時間の記録（受け入れ基準 F2①「応答5秒以内」の実測用）。
 *
 * **出すのは経過ミリ秒・プロバイダ・モデル・結果だけ**で、質問文・回答文・
 * 利用者IDは一切含めない（`CLAUDE.md` 8章「ログ出力に個人情報を含めない」）。
 * ベンチマークを1回流すのではなく実使用を測るため、講師トレーニングや
 * 授業中の操作がそのまま受け入れ資料の測定データになる。
 *
 * 集計例:
 *   docker compose logs app | grep "\[F2\]"
 */
function logResponseTime(
  startedAt: number,
  outcome: "ok" | "blocked" | "error" | "aborted" | "timeout" | "outage",
  model?: string,
): void {
  console.log(
    `[F2] elapsedMs=${Date.now() - startedAt} provider=${process.env.AI_PROVIDER ?? "mock"} model=${model ?? "-"} outcome=${outcome}`,
  );
}

/** 静的教材モードの応答。受講生に見せてよい情報だけを返す（通知の状況などは含めない） */
function staticModeResponse(outage: OutageInfo): NextResponse {
  return NextResponse.json(
    { mode: "static", since: outage.since, material: outage.material },
    { status: 503 },
  );
}

export async function POST(request: NextRequest) {
  let body: { question?: unknown };
  try {
    body = await request.json();
  } catch {
    return new NextResponse("リクエストの形式が正しくありません", { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question : "";

  // 停止中は推論を呼ばない（16人全員を10秒ずつ待たせない）。一定間隔で1件だけ再試行する
  const gate = await shouldAttemptInference();
  if (!gate.attempt) {
    logResponseTime(Date.now(), "outage");
    return staticModeResponse(gate.outage);
  }

  // 推論そのものの時間を測る（本文の読み取りは含めない）
  const startedAt = Date.now();
  // サーバー側でも打ち切る。受講生の中断（request.signal）と区別するため別のシグナルにする
  const timeoutController = new AbortController();
  const timeoutTimer = setTimeout(() => timeoutController.abort(), INFERENCE_TIMEOUT_MS);
  const onClientAbort = () => timeoutController.abort();
  request.signal.addEventListener("abort", onClientAbort);

  try {
    const answer = await answerQuestion(question, undefined, timeoutController.signal);
    const elapsedMs = Date.now() - startedAt;
    logResponseTime(startedAt, answer.blocked ? "blocked" : "ok", answer.model);

    // フィルタでブロックした回答も「推論は動いた」ので成功に数える。
    // 停止中からの復旧はここで起きる（監査ログに残る）
    try {
      await recordInferenceSuccess();
    } catch (e) {
      console.error("稼働状態の更新に失敗しました:", e instanceof Error ? e.message : e);
    }

    // 会話ログを残す（保存するのは**マスキング済みの本文だけ**）。
    // 記録に失敗しても回答は返す — ログのために授業を止めない
    try {
      const actor = await getCurrentUser();
      await recordChatLog({
        studentId: actor.userId,
        maskedQuestion: answer.maskedQuestion,
        reply: answer.reply,
        blocked: answer.blocked,
        piiDetected: answer.piiDetected,
        elapsedMs,
        model: answer.model,
      });
    } catch (e) {
      console.error("会話ログの記録に失敗しました:", e instanceof Error ? e.message : e);
    }

    return NextResponse.json(answer);
  } catch (error) {
    if (error instanceof ValidationError) {
      // 入力エラーは推論に到達していないので測定対象にも停止判定にもしない
      return new NextResponse(error.message, { status: 400 });
    }
    // 受講生が画面を離れる等でリクエストが切れた場合。応答は破棄されるため
    // エラーとして記録せず、静かに終える（サーバー側の推論は中断済み）。
    // **停止判定には数えない** — 受講生が「やめる」を押しただけかもしれない
    if (request.signal.aborted) {
      logResponseTime(startedAt, "aborted");
      return new NextResponse("中断されました", { status: 499 });
    }

    const timedOut = timeoutController.signal.aborted;
    // 個人情報は含めずエラー種別のみ記録する（質問本文はログしない）
    logResponseTime(startedAt, timedOut ? "timeout" : "error");
    console.error(
      "AIチャット処理エラー:",
      timedOut ? `推論が${INFERENCE_TIMEOUT_MS}msを超えました` : error instanceof Error ? error.message : error,
    );

    // 失敗を数え、閾値に達したら停止中へ。通知は切り替えた1件だけが行う（待たない）
    let outage: OutageInfo | null = null;
    try {
      const result = await recordInferenceFailure();
      outage = result.outage;
      if (result.opened && outage) {
        const since = outage.since;
        void notifyAiOutage(since).catch((e) =>
          console.error("停止通知に失敗しました:", e instanceof Error ? e.message : e),
        );
      }
    } catch (e) {
      console.error("稼働状態の更新に失敗しました:", e instanceof Error ? e.message : e);
    }
    if (outage) return staticModeResponse(outage);

    return new NextResponse(
      timedOut
        ? "時間がかかりすぎています。「もう一度きく」を押してください"
        : "AIがこたえられませんでした。しばらくしてから、もう一度ためしてください",
      { status: timedOut ? 504 : 500 },
    );
  } finally {
    clearTimeout(timeoutTimer);
    request.signal.removeEventListener("abort", onClientAbort);
  }
}
