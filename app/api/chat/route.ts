import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordChatLog } from "@/lib/f2/chatLog";
import { answerQuestion, ValidationError } from "@/lib/f2/tutor";

/**
 * S3 AIチャットのAPI（F2）。ゲストの利用は proxy.ts で403ガード済み。
 * 2026-07-03 監査指摘#9の修正: 入力起因のエラー（ValidationError）だけを400にし、
 * サーバー都合のエラー（設定不備・推論失敗）は内部メッセージを生徒に見せず
 * 定型文の500を返す。
 */

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
  outcome: "ok" | "blocked" | "error" | "aborted",
  model?: string,
): void {
  console.log(
    `[F2] elapsedMs=${Date.now() - startedAt} provider=${process.env.AI_PROVIDER ?? "mock"} model=${model ?? "-"} outcome=${outcome}`,
  );
}

export async function POST(request: NextRequest) {
  let body: { question?: unknown };
  try {
    body = await request.json();
  } catch {
    return new NextResponse("リクエストの形式が正しくありません", { status: 400 });
  }

  // 推論そのものの時間を測る（本文の読み取りは含めない）
  const startedAt = Date.now();
  try {
    const answer = await answerQuestion(
      typeof body.question === "string" ? body.question : "",
      undefined,
      request.signal,
    );
    const elapsedMs = Date.now() - startedAt;
    logResponseTime(startedAt, answer.blocked ? "blocked" : "ok", answer.model);

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
      // 入力エラーは推論に到達していないので測定対象にしない
      return new NextResponse(error.message, { status: 400 });
    }
    // 受講生が画面を離れる等でリクエストが切れた場合。応答は破棄されるため
    // エラーとして記録せず、静かに終える（サーバー側の推論は中断済み）。
    if (request.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      logResponseTime(startedAt, "aborted");
      return new NextResponse("中断されました", { status: 499 });
    }
    // 個人情報は含めずエラー種別のみ記録する（質問本文はログしない）
    logResponseTime(startedAt, "error");
    console.error("AIチャット処理エラー:", error instanceof Error ? error.message : error);
    return new NextResponse(
      "AIがこたえられませんでした。しばらくしてから、もう一度ためしてください",
      { status: 500 },
    );
  }
}
