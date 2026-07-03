import { NextResponse, type NextRequest } from "next/server";
import { applyAiGrade, resume, start, submit, TransitionError } from "@/lib/f3/stateMachine";
import { createGrader } from "@/lib/f3/grading";
import { getCurrentStudentId } from "@/lib/auth";
import { recordAudit } from "@/lib/audit/log";
import { findSubmission, getStore } from "@/lib/f3/store";
import type { Assignment } from "@/lib/f3/types";

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

  const submission = findSubmission(id, getCurrentStudentId());
  if (!submission) {
    return new NextResponse("提出データが見つかりません", { status: 404 });
  }

  let body: {
    promptText?: string;
    aiOutputText?: string;
    reflectionText?: string;
  };
  try {
    body = await request.json();
  } catch {
    return new NextResponse("リクエストの形式が正しくありません", { status: 400 });
  }

  try {
    let next = submission;
    if (next.status === "not_started") next = start(next);
    if (next.status === "returned") next = resume(next);
    next = submit(next, assignment, {
      promptText: body.promptText ?? "",
      aiOutputText: body.aiOutputText,
      reflectionText: body.reflectionText,
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

    void gradeInBackground(next.id, assignment);

    return NextResponse.json({ status: next.status, isLate: next.isLate });
  } catch (error) {
    if (error instanceof TransitionError) {
      return new NextResponse(error.message, { status: 400 });
    }
    throw error;
  }
}

/** バックグラウンドのAI一次採点。失敗しても提出は失わない（手動採点で処理可能） */
async function gradeInBackground(
  submissionId: string,
  assignment: Assignment,
): Promise<void> {
  const store = getStore();
  try {
    const submitted = store.submissions.get(submissionId);
    if (!submitted || submitted.status !== "submitted") return;
    const grade = await createGrader().grade(assignment, submitted.promptText);
    // 採点中に講師が手動処理した場合は上書きしない
    const fresh = store.submissions.get(submissionId);
    if (!fresh || fresh.status !== "submitted") return;
    const next = applyAiGrade(fresh, grade);
    store.submissions.set(next.id, next);
    recordAudit({
      actorRole: "system",
      action: "update",
      entity: "submission",
      entityId: next.id,
      before: { status: fresh.status },
      after: { status: next.status, aiScore: grade.totalScore },
    });
  } catch (error) {
    // 質問・提出本文はログしない（個人情報を含み得るため）
    console.error(
      "AI採点に失敗しました（提出は保持されます）:",
      error instanceof Error ? error.message : error,
    );
  }
}
