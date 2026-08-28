import { NextResponse, type NextRequest } from "next/server";
import { resume, start, submit, TransitionError } from "@/lib/f3/stateMachine";
import { runAiGrading } from "@/lib/f3/gradingTask";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit/log";
import { findSubmission, getAssignment, updateSubmissionIfVersion } from "@/lib/f3/store";
import { getLtiConfig } from "@/lib/lti/config";
import { getToolPrivateKey } from "@/lib/lti/keys";
import { canSyncSubmission, syncSubmissionToCanvas } from "@/lib/lti/services/submissionSync";

/**
 * 提出済み・未採点をCanvasへ知らせる（B-2）。この起動でlineitemが無い、または
 * ツールの署名鍵が未設定なら何もしない（コースナビ起動はlineitemを持たないため
 * 通常時は静かにスキップする）。Canvas送信の失敗は提出そのものを失敗させない
 * （応答返却後の非同期処理。AI採点と同じ考え方）。
 */
async function syncSubmissionProgress(actor: CurrentUser): Promise<void> {
  if (!canSyncSubmission(actor.ags)) return;
  const cfg = getLtiConfig();
  if (!cfg) return;
  const privateKey = await getToolPrivateKey();
  if (!privateKey) return;
  try {
    await syncSubmissionToCanvas(
      actor.ags,
      cfg,
      privateKey,
      process.env.LTI_KEY_ID ?? "ngais-tool-key",
    );
  } catch (e) {
    console.error("[LTI AGS] 提出状態の送信に失敗しました", e);
  }
}

/**
 * 受講生の提出（F3）: 取組中→提出済。AI一次採点は応答返却後にバックグラウンドで
 * 実行する（実プロバイダでは数十秒かかるため、提出応答をブロックしない）。
 * AI採点失敗時は提出済のまま保持し、講師の手動採点で処理できる（F3例外5）。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const assignment = await getAssignment(id);
  if (!assignment) {
    return new NextResponse("課題が見つかりません", { status: 404 });
  }

  const actor = await getCurrentUser();

  let body: {
    promptText?: unknown;
    aiOutputText?: unknown;
    reflectionText?: unknown;
    expectedVersion?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return new NextResponse("リクエストの形式が正しくありません", { status: 400 });
  }

  // 文字列以外の値を保存しない（画面のレンダリング破壊防止 — 夜間レビュー指摘#2）
  for (const [key, value] of Object.entries({
    promptText: body.promptText,
    aiOutputText: body.aiOutputText,
    reflectionText: body.reflectionText,
  })) {
    if (value !== undefined && typeof value !== "string") {
      return new NextResponse(`${key} は文字列で指定してください`, { status: 400 });
    }
  }

  if (
    body.expectedVersion !== undefined &&
    (typeof body.expectedVersion !== "number" ||
      !Number.isInteger(body.expectedVersion))
  ) {
    return new NextResponse("expectedVersion は整数で指定してください", {
      status: 400,
    });
  }

  const submission = await findSubmission(id, actor.userId);
  if (!submission) {
    return new NextResponse("提出データが見つかりません", { status: 404 });
  }

  // 版数チェック: 画面が読んだ版と現在の版が食い違えば、別の端末/タブで更新済み。
  if (
    body.expectedVersion !== undefined &&
    body.expectedVersion !== submission.version
  ) {
    return new NextResponse(
      "この課題は別の端末で更新されています。画面を読み込み直して、最新の内容で操作してください。",
      { status: 409 },
    );
  }

  try {
    let next = submission;
    if (next.status === "not_started") next = start(next);
    if (next.status === "returned") next = resume(next);
    next = submit(next, assignment, {
      promptText: (body.promptText as string | undefined) ?? "",
      aiOutputText: body.aiOutputText as string | undefined,
      reflectionText: body.reflectionText as string | undefined,
    });
    // 講師の確定スコアをCanvasへ書き戻すため、提出者のCanvas利用者IDを控える（F3①）。
    // 採点は別セッション（講師）で行うため、提出時点で保存しておく必要がある
    next = { ...next, canvasUserId: actor.canvasUserId ?? next.canvasUserId };

    // 版数一致を条件にしたDB更新（楽観ロック）。読取り時の版数から変わっていなければ
    // 書込みが成立する。競合時（別端末が先に更新済み）は null（既知残課題#1の解消）。
    const updated = await updateSubmissionIfVersion(next, submission.version);
    if (!updated) {
      return new NextResponse(
        "この課題は別の端末で更新されています。画面を読み込み直して、最新の内容で操作してください。",
        { status: 409 },
      );
    }

    await recordAudit({
      actorRole: actor.role,
      actorId: actor.viaLti ? actor.userId : undefined,
      action: "update",
      entity: "submission",
      entityId: updated.id,
      before: { status: submission.status, version: submission.version },
      after: { status: updated.status, version: updated.version, isLate: updated.isLate },
    });

    void runAiGrading(updated.id, updated.version, assignment);
    void syncSubmissionProgress(actor);

    return NextResponse.json({ status: updated.status, isLate: updated.isLate });
  } catch (error) {
    if (error instanceof TransitionError) {
      return new NextResponse(error.message, { status: 400 });
    }
    throw error;
  }
}
