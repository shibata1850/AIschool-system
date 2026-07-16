import { NextResponse, type NextRequest } from "next/server";
import { CURRENT_LESSON_WEEK, setAttendance } from "@/lib/f3/store";
import { STUDENTS } from "@/lib/f4/fixtures";
import { recordAudit } from "@/lib/audit/log";
import { getCurrentUser } from "@/lib/auth";

/**
 * 出席の記録（未決#11）。講師・管理者のみ（proxy.ts /api/teacher ガード）。
 * 指定した受講生の当該週の出席を true/false で更新し、監査ログに記録する。
 */
export async function POST(request: NextRequest) {
  let body: { studentId?: unknown; weekStart?: unknown; attended?: unknown };
  try {
    body = await request.json();
  } catch {
    return new NextResponse("リクエストの形式が正しくありません", { status: 400 });
  }
  if (typeof body.studentId !== "string") {
    return new NextResponse("studentId は文字列で指定してください", { status: 400 });
  }
  if (typeof body.attended !== "boolean") {
    return new NextResponse("attended は true/false で指定してください", { status: 400 });
  }
  // 週は既定で当該コマ。指定がある場合は文字列のみ許可
  const weekStart =
    typeof body.weekStart === "string" ? body.weekStart : CURRENT_LESSON_WEEK;

  // 名簿にいる受講生のみ（架空のデモ名簿で検証）
  if (!STUDENTS.some((s) => s.id === body.studentId)) {
    return new NextResponse("その受講生は名簿にいません", { status: 400 });
  }

  const result = setAttendance(body.studentId, weekStart, body.attended);
  if (result.changed) {
    const actor = await getCurrentUser();
    recordAudit({
      actorRole: actor.role,
      actorId: actor.viaLti ? actor.userId : undefined,
      action: "update",
      entity: "attendance",
      entityId: `${body.studentId}/${weekStart}`,
      before: { attended: result.before },
      after: { attended: body.attended },
    });
  }
  return NextResponse.json({ attended: body.attended, changed: result.changed });
}
