import { NextResponse, type NextRequest } from "next/server";
import { complete, returnToStudent, TransitionError } from "@/lib/f3/stateMachine";
import { getStore } from "@/lib/f3/store";

/**
 * 講師の確認（F3）: AI採点済→完了 または 差戻し。
 * 権限（講師・管理者のみ）は middleware.ts で403ガード済み。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const store = getStore();
  const submission = store.submissions.get(id);
  if (!submission) {
    return new NextResponse("提出が見つかりません", { status: 404 });
  }

  const body = (await request.json()) as {
    action?: "complete" | "return";
    score?: number;
    comment?: string;
  };

  try {
    const next =
      body.action === "return"
        ? returnToStudent(submission, body.comment ?? "")
        : complete(submission, body.score);
    store.submissions.set(next.id, next);
    return NextResponse.json({ status: next.status, hasDeviation: next.hasDeviation });
  } catch (error) {
    if (error instanceof TransitionError) {
      return new NextResponse(error.message, { status: 400 });
    }
    throw error;
  }
}
