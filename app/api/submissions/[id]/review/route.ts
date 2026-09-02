import { NextResponse, type NextRequest } from "next/server";
import { complete, returnToStudent, TransitionError } from "@/lib/f3/stateMachine";
import { recordAudit } from "@/lib/audit/log";
import {
  getSubmissionById,
  recordCanvasSync,
  recordCompletionScore,
  updateSubmissionIfVersion,
} from "@/lib/f3/store";
import { syncGradeToCanvas, type GradeSyncResult } from "@/lib/canvas/syncGrade";
import { getCurrentUser } from "@/lib/auth";

/**
 * 講師の確認（F3）: 提出済・AI採点済→完了 または 差戻し。
 * 権限（講師・管理者のみ）は proxy.ts で403ガード済み。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const submission = await getSubmissionById(id);
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

    const updated = await updateSubmissionIfVersion(
      next,
      submission.version,
      submission.status,
    );
    if (!updated) {
      return new NextResponse(
        "この提出は別の操作で更新されています。画面を読み込み直して、最新の内容で操作してください。",
        { status: 409 },
      );
    }
    // Canvasへの反映は「ローカル確定のあと」に行う。Canvasが落ちていても
    // 採点そのものは成立させ、反映状況だけを記録する（F3①）
    let canvasSync: GradeSyncResult | undefined;
    if (updated.status === "completed" && updated.teacherScore !== undefined) {
      // 成績確定を到達度の学習記録へ反映する（F3→F4連携）
      await recordCompletionScore(updated.studentId, updated.teacherScore);

      canvasSync = await syncGradeToCanvas({
        canvasUserId: updated.canvasUserId,
        score: updated.teacherScore,
        comment: updated.aiGrade?.feedback,
      });
      await recordCanvasSync(
        updated.id,
        canvasSync.state === "synced"
          ? { syncedAt: new Date() }
          : { error: canvasSync.reason },
      );
    }
    const actor = await getCurrentUser();
    await recordAudit({
      actorRole: actor.role,
      actorId: actor.viaLti ? actor.userId : undefined,
      action: "update",
      entity: "submission",
      entityId: updated.id,
      before: { status: submission.status, teacherScore: submission.teacherScore },
      after: {
        status: updated.status,
        teacherScore: updated.teacherScore,
        hasDeviation: updated.hasDeviation,
        canvasSync: canvasSync?.state,
      },
    });
    return NextResponse.json({
      status: updated.status,
      hasDeviation: updated.hasDeviation,
      canvasSync,
    });
  } catch (error) {
    if (error instanceof TransitionError) {
      return new NextResponse(error.message, { status: 400 });
    }
    throw error;
  }
}
