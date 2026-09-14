import { NextResponse, type NextRequest } from "next/server";
import { createCanvasClient } from "@/lib/canvas/client";
import { CanvasApiError } from "@/lib/canvas/client";
import { parseScore, resolveScopedGradebook } from "@/lib/canvas/gradebook";
import { recordAudit } from "@/lib/audit/log";
import { getCurrentUser } from "@/lib/auth";
import { teacherCourseAccess } from "@/lib/course/access";

/**
 * 講師採点をCanvasの成績表へ書き込む（B-3）。
 * ルート内でも講師権限と検証済みLTIコースを確認する。
 */
export async function POST(request: NextRequest) {
  const actor = await getCurrentUser();
  const access = teacherCourseAccess(actor);
  if (!access) {
    return new NextResponse("Canvasのコースから講師として起動してください", { status: 403 });
  }
  const client = createCanvasClient();
  if (!client) {
    // Canvas未接続（デモ）環境では成績反映はできない
    return new NextResponse(
      "Canvasに接続していないため成績を反映できません（デモモード）",
      { status: 409 },
    );
  }
  if (!access.courseId) {
    return new NextResponse("Canvasのコースから講師として起動してください", { status: 403 });
  }

  let body: { userId?: unknown; assignmentId?: unknown; score?: unknown; comment?: unknown };
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
  } catch {
    return new NextResponse("リクエストの形式が正しくありません", { status: 400 });
  }

  if (typeof body.userId !== "number" || !Number.isSafeInteger(body.userId) || body.userId <= 0) {
    return new NextResponse("userId は受講生のCanvas IDを数値で指定してください", {
      status: 400,
    });
  }
  if (typeof body.assignmentId !== "number" || !Number.isSafeInteger(body.assignmentId) || body.assignmentId <= 0) {
    return new NextResponse("採点するCanvas課題を選択してください", { status: 400 });
  }
  const parsed = parseScore(body.score);
  if (!parsed.ok) {
    return new NextResponse(parsed.message, { status: 400 });
  }
  if (body.comment !== undefined && typeof body.comment !== "string") {
    return new NextResponse("comment は文字列で指定してください", { status: 400 });
  }
  if (typeof body.comment === "string" && body.comment.length > 1000) {
    return new NextResponse("コメントは1,000文字以内で入力してください", { status: 400 });
  }

  // 対象コース・課題はサーバー側で解決し、受講生が名簿にいることを確認する
  const gb = await resolveScopedGradebook(client, access.courseId, body.assignmentId);
  if (gb.state !== "ok") {
    const message =
      gb.state === "error"
        ? gb.message
        : "Canvasに採点対象のコース・課題が見つかりません";
    return new NextResponse(message, { status: 409 });
  }
  const row = gb.rows.find((r) => r.student.id === body.userId);
  if (!row) {
    return new NextResponse("その受講生はこのコースの名簿にいません", { status: 403 });
  }

  try {
    const result = await client.gradeSubmission(
      gb.course.id,
      gb.assignment.id,
      body.userId,
      parsed.score,
      typeof body.comment === "string" && body.comment.length > 0 ? body.comment : undefined,
    );
    await recordAudit({
      actorRole: actor.role,
      actorId: actor.viaLti ? actor.userId : undefined,
      action: "update",
      entity: "canvas_grade",
      // 監査ログに氏名は残さない（IDのみ — CLAUDE.md 9章）
      entityId: `course:${gb.course.id}/assignment:${gb.assignment.id}/user:${body.userId}`,
      before: { score: row.score },
      after: { score: parsed.score, courseId: access.courseId },
    });
    return NextResponse.json({ score: result.score ?? parsed.score });
  } catch (error) {
    if (error instanceof CanvasApiError) {
      // 応答本文は個人情報を含み得るため載せない
      return new NextResponse(
        `Canvasへの反映に失敗しました（HTTP ${error.status}）。時間をおいて再度お試しください`,
        { status: 502 },
      );
    }
    throw error;
  }
}
