import { NextResponse, type NextRequest } from "next/server";
import { getAuditLog, recordAudit } from "@/lib/audit/log";
import { auditToCsv } from "@/lib/audit/csv";
import { getCurrentUser } from "@/lib/auth";

/**
 * 監査ログのCSVエクスポート（S10）。管理者のみ（proxy.ts の /admin ガード）。
 * 出力操作自体も監査ログに記録する（要件定義書5.2・S10）。
 */
export async function GET(_request: NextRequest) {
  const entries = getAuditLog();
  const csv = auditToCsv(entries);

  const actor = await getCurrentUser();
  recordAudit({
    actorRole: actor.role,
    actorId: actor.viaLti ? actor.userId : undefined,
    action: "create",
    entity: "audit_export",
    entityId: `csv:${entries.length}件`,
  });

  // Excel（日本語）でも文字化けしないようBOMを付与
  const body = `﻿${csv}`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="audit-log.csv"',
    },
  });
}
