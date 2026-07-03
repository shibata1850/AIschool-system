import { NextResponse, type NextRequest } from "next/server";
import { applyAiGrade, resume, start, submit, TransitionError } from "@/lib/f3/stateMachine";
import { createGrader } from "@/lib/f3/grading";
import { getCurrentStudentId } from "@/lib/auth";
import { getStore } from "@/lib/f3/store";

/**
 * 受講生の提出（F3）: 取組中→提出済→（同期でAI一次採点）→AI採点済。
 * AI採点失敗時は提出済のまま保持する（F3例外5。リトライは今後実装）。
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

  const submission = [...store.submissions.values()].find(
    (s) => s.assignmentId === id && s.studentId === getCurrentStudentId(),
  );
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

    try {
      const grade = await createGrader().grade(assignment, next.promptText);
      next = applyAiGrade(next, grade);
      store.submissions.set(next.id, next);
    } catch {
      // AI採点失敗: 提出済のまま保持（受講生の提出は失わない）
    }

    return NextResponse.json({ status: next.status, isLate: next.isLate });
  } catch (error) {
    if (error instanceof TransitionError) {
      return new NextResponse(error.message, { status: 400 });
    }
    throw error;
  }
}
