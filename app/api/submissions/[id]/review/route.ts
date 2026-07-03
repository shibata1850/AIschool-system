import { NextResponse, type NextRequest } from "next/server";
import { complete, returnToStudent, TransitionError } from "@/lib/f3/stateMachine";
import { getStore } from "@/lib/f3/store";

/**
 * 講師の確認（F3）: 提出済・AI採点済→完了 または 差戻し。
 * 権限（講師・管理者のみ）は proxy.ts で403ガード済み。
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

  let body: { action?: unknown; score?: unknown; comment?: unknown };
  try {
    body = await request.json();
  } catch {
    return new NextResponse("リクエストの形式が正しくありません", { status: 400 });
  }

  // 不明な action を「完了」に倒さない（2026-07-03 監査指摘#3: 完了は不可逆のため）
  if (body.action !== "complete" && body.action !== "return") {
    return new NextResponse(
      'action には "complete" または "return" を指定してください',
      { status: 400 },
    );
  }
  if (body.score !== undefined && typeof body.score !== "number") {
    return new NextResponse("score は数値で指定してください", { status: 400 });
  }

  try {
    const next =
      body.action === "return"
        ? returnToStudent(submission, typeof body.comment === "string" ? body.comment : "")
        : complete(submission, body.score as number | undefined);
    store.submissions.set(next.id, next);
    return NextResponse.json({ status: next.status, hasDeviation: next.hasDeviation });
  } catch (error) {
    if (error instanceof TransitionError) {
      return new NextResponse(error.message, { status: 400 });
    }
    throw error;
  }
}
