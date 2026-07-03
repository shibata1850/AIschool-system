import { NextResponse, type NextRequest } from "next/server";
import { recordAudit } from "@/lib/audit/log";
import { setDeviceBackup } from "@/lib/f3/store";

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

  const updated = setDeviceBackup(seatNo, body.usingBackup);
  if (!updated) {
    return new NextResponse("座席が見つかりません", { status: 404 });
  }

  recordAudit({
    actorRole: request.cookies.get("role")?.value ?? "unknown",
    action: "update",
    entity: "device_assignment",
    entityId: `seat-${seatNo}`,
    before: { usingBackup: !body.usingBackup },
    after: { usingBackup: body.usingBackup },
  });

  return NextResponse.json({ seatNo, usingBackup: updated.usingBackup });
}
