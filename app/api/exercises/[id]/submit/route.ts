import { NextResponse, type NextRequest } from "next/server";
import { resume, start, submit, TransitionError } from "@/lib/f3/stateMachine";
import { runAiGrading } from "@/lib/f3/gradingTask";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit/log";
import { findSubmission, getStore } from "@/lib/f3/store";

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
  const store = getStore();
  const assignment = store.assignments.get(id);
  if (!assignment) {
    return new NextResponse("課題が見つかりません", { status: 404 });
  }

  const { userId } = await getCurrentUser();
  const submission = findSubmission(id, userId);
  if (!submission) {
    return new NextResponse("提出データが見つかりません", { status: 404 });
  }

  let body: {
    promptText?: unknown;
    aiOutputText?: unknown;
    reflectionText?: unknown;
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

  try {
    let next = submission;
    if (next.status === "not_started") next = start(next);
    if (next.status === "returned") next = resume(next);
    next = submit(next, assignment, {
      promptText: (body.promptText as string | undefined) ?? "",
      aiOutputText: body.aiOutputText as string | undefined,
      reflectionText: body.reflectionText as string | undefined,
    });
    store.submissions.set(next.id, next);
    recordAudit({
      actorRole: request.cookies.get("role")?.value ?? "student",
      action: "update",
      entity: "submission",
      entityId: next.id,
      before: { status: submission.status, version: submission.version },
      after: { status: next.status, version: next.version, isLate: next.isLate },
    });

    void runAiGrading(next.id, next.version, assignment);

    return NextResponse.json({ status: next.status, isLate: next.isLate });
  } catch (error) {
    if (error instanceof TransitionError) {
      return new NextResponse(error.message, { status: 400 });
    }
    throw error;
  }
}
