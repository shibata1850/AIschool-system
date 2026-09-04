import { NextResponse, type NextRequest } from "next/server";
import { recordAudit } from "@/lib/audit/log";
import { getDeviceAssignment, setDeviceStudent } from "@/lib/f3/store";
import { getCurrentUser } from "@/lib/auth";
import { getRoster } from "@/lib/roster";

/**
 * S9: 座席に座る受講生を割り当てる／空席に戻す。権限は proxy.ts（講師・管理者のみ）。
 *
 * **なぜ必要か**（2026-09-04）: 座席の割当表は初期データの架空ID（s02 など）のままで、
 * LTIで実際に起動した受講生はどの座席にも紐づかず、講師画面で座席番号 0 と表示された。
 * 開講日に「16台がそれぞれ別の受講生として見える」状態を作るには、講師が画面から
 * 座席へ割り当てられる必要がある（docs/受け入れ当日手順.md ①）。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ seatNo: string }> },
) {
  const { seatNo: seatNoText } = await params;
  const seatNo = Number(seatNoText);
  if (!Number.isInteger(seatNo)) {
    return new NextResponse("座席番号が正しくありません", { status: 400 });
  }

  let body: { studentId?: unknown };
  try {
    body = await request.json();
  } catch {
    return new NextResponse("リクエストの形式が正しくありません", { status: 400 });
  }
  // null は「空席に戻す」。未指定（undefined）は指示が無いのと区別できないため弾く
  if (body.studentId !== null && typeof body.studentId !== "string") {
    return new NextResponse("studentId は受講生のIDか null で指定してください", {
      status: 400,
    });
  }
  const studentId = body.studentId;

  // 名簿にない受講生は割り当てさせない（宛先の打ち間違いをここで止める）
  if (studentId !== null && !(await getRoster()).some((s) => s.id === studentId)) {
    return new NextResponse("その受講生は名簿にありません", { status: 400 });
  }

  const current = await getDeviceAssignment(seatNo);
  if (!current) {
    return new NextResponse("座席が見つかりません", { status: 404 });
  }
  // 無変更（二重タップ・同時操作）は監査ログに記録しない
  if (current.studentId === studentId) {
    return NextResponse.json({ seatNo, studentId, changed: false });
  }

  const result = await setDeviceStudent(seatNo, studentId);
  if (!result) {
    return new NextResponse("座席が見つかりません", { status: 404 });
  }

  const actor = await getCurrentUser();
  await recordAudit({
    actorRole: actor.role,
    actorId: actor.viaLti ? actor.userId : undefined,
    action: "update",
    entity: "device_assignment",
    entityId: `seat-${seatNo}`,
    before: { studentId: result.before },
    after: { studentId },
  });

  return NextResponse.json({ seatNo, studentId, changed: true });
}
