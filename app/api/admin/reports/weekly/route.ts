import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit/log";
import { generateWeeklyReport } from "@/lib/f4/generateWeeklyReport";

/**
 * 週次到達度レポートの生成（F4①）。管理者のみ（proxy.ts の /api/admin ガード）。
 * 通常運用は cron（scripts/generate-weekly-report.ts）が担い、本APIは
 * 受け入れテストと、生成失敗時の手動再実行のための入口。
 *
 * 対象週は body.weekStart（省略時は実行日の週）。同じ週の再実行は上書き（冪等）。
 */
export async function POST(request: NextRequest) {
  let body: { weekStart?: unknown } = {};
  try {
    const text = await request.text();
    if (text) {
      const parsed: unknown = JSON.parse(text);
      // 文字列・配列・null などオブジェクト以外は受け付けない
      // （壊れたJSONでも文字列として解釈が通ってしまい、指定漏れと区別がつかなくなるため）
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return new NextResponse("リクエストの形式が正しくありません", { status: 400 });
      }
      body = parsed as { weekStart?: unknown };
    }
  } catch {
    return new NextResponse("リクエストの形式が正しくありません", { status: 400 });
  }

  if (body.weekStart !== undefined) {
    if (typeof body.weekStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.weekStart)) {
      return new NextResponse("weekStart は YYYY-MM-DD（週の月曜）で指定してください", {
        status: 400,
      });
    }
  }

  const { report, generatedAt, notify } = await generateWeeklyReport({
    weekStart: body.weekStart as string | undefined,
  });

  const actor = await getCurrentUser();
  await recordAudit({
    actorRole: actor.role,
    actorId: actor.viaLti ? actor.userId : undefined,
    action: "create",
    entity: "weekly_report",
    entityId: report.weekStart,
    // 監査ログに個人の点数は残さない（件数のみ — CLAUDE.md 9章）
    after: {
      generatedAt,
      studentCount: report.summary.studentCount,
      alertCount: report.alerts.length,
      notify: notify.state,
    },
  });

  return NextResponse.json({
    weekStart: report.weekStart,
    generatedAt,
    studentCount: report.summary.studentCount,
    alertCount: report.alerts.length,
    notify,
  });
}
