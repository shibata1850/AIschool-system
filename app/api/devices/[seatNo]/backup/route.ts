import { NextResponse, type NextRequest } from "next/server";
import { recordAudit } from "@/lib/audit/log";
import { getDeviceAssignment, setDeviceBackup } from "@/lib/f3/store";
import { getCurrentUser } from "@/lib/auth";

/**
 * S9: 座席の表示デバイスを予備機（モバイルモニター）へ切替/復帰する。
 * GOOVIS不調時の運用（未決事項#4の仮決定）。権限は proxy.ts（講師・管理者のみ）。
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

  let body: { usingBackup?: unknown };
  try {
    body = await request.json();
  } catch {
    return new NextResponse("リクエストの形式が正しくありません", { status: 400 });
  }
  if (typeof body.usingBackup !== "boolean") {
    return new NextResponse("usingBackup は true/false で指定してください", {
      status: 400,
    });
  }

  const current = getDeviceAssignment(seatNo);
  if (!current) {
    return new NextResponse("座席が見つかりません", { status: 404 });
  }

  // 無変更（二重タップ・同時操作）は監査ログに記録しない — 変更前後は実測値のみ
  const beforeValue = current.usingBackup;
  if (beforeValue === body.usingBackup) {
    return NextResponse.json({ seatNo, usingBackup: beforeValue, changed: false });
  }

  setDeviceBackup(seatNo, body.usingBackup);
  const actor = await getCurrentUser();
  recordAudit({
    actorRole: actor.role,
    actorId: actor.viaLti ? actor.userId : undefined,
    action: "update",
    entity: "device_assignment",
    entityId: `seat-${seatNo}`,
    before: { usingBackup: beforeValue },
    after: { usingBackup: body.usingBackup },
  });

  return NextResponse.json({ seatNo, usingBackup: body.usingBackup, changed: true });
}
