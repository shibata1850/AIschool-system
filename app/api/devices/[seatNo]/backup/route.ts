import { NextResponse, type NextRequest } from "next/server";
import { recordAudit } from "@/lib/audit/log";
import { getDeviceAssignment, setDeviceBackup } from "@/lib/f3/store";
import { getCurrentUser } from "@/lib/auth";
import { getLtiConfig } from "@/lib/lti/config";

/**
 * S9: 座席の表示デバイスを予備機（モバイルモニター）へ切替/復帰する。
 * 主モニター不調時の運用（未決事項#4は2026-08-24パンフレットv2で確定）。権限は proxy.ts（講師・管理者のみ）。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ seatNo: string }> },
) {
  const actor = await getCurrentUser();
  if (actor.role !== "teacher" && actor.role !== "admin") {
    return new NextResponse("権限がありません", { status: 403 });
  }
  const toolUrl = getLtiConfig()?.toolUrl;
  if (!toolUrl || request.headers.get("origin") !== new URL(toolUrl).origin) {
    return new NextResponse("送信元を確認できません", { status: 403 });
  }
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
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return new NextResponse("リクエストの形式が正しくありません", { status: 400 });
  }
  if (typeof body.usingBackup !== "boolean") {
    return new NextResponse("usingBackup は true/false で指定してください", {
      status: 400,
    });
  }

  const current = await getDeviceAssignment(seatNo);
  if (!current) {
    return new NextResponse("座席が見つかりません", { status: 404 });
  }

  // 無変更（二重タップ・同時操作）は監査ログに記録しない — 変更前後は実測値のみ
  const beforeValue = current.usingBackup;
  if (beforeValue === body.usingBackup) {
    return NextResponse.json({ seatNo, usingBackup: beforeValue, changed: false });
  }

  await setDeviceBackup(seatNo, body.usingBackup);
  await recordAudit({
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
