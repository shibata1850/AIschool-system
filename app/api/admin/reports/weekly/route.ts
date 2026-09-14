import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { teacherCourseAccess } from "@/lib/course/access";
import { getLtiConfig } from "@/lib/lti/config";
import { recordAudit } from "@/lib/audit/log";
import { generateWeeklyReport } from "@/lib/f4/generateWeeklyReport";
import { isReportWeek } from "@/lib/f4/reportWeek";
import { WeeklyReportBusyError } from "@/lib/db/client";

/**
 * 週次到達度レポートの生成（F4①）。管理者のみ（proxy.ts の /api/admin ガード）。
 * 通常運用は cron（scripts/generate-weekly-report.ts）が担い、本APIは
 * 受け入れテストと、生成失敗時の手動再実行のための入口。
 *
 * 対象週は body.weekStart（省略時は日本時間の実行日の週）。通知開始後は保存済みを使用し再送しない。
 */
export async function POST(request: NextRequest) {
  const actor = await getCurrentUser();
  const courseId = teacherCourseAccess(actor)?.courseId;
  if (actor.role !== "admin" || !actor.viaLti || !courseId) {
    return new NextResponse("管理者としてCanvasのコースから起動してください", { status: 403 });
  }
  const toolUrl = getLtiConfig()?.toolUrl;
  if (!toolUrl || request.headers.get("origin") !== new URL(toolUrl).origin) {
    return new NextResponse("送信元を確認できません", { status: 403 });
  }
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
    if (!isReportWeek(body.weekStart)) {
      return new NextResponse("weekStart は YYYY-MM-DD（週の月曜）で指定してください", {
        status: 400,
      });
    }
  }

  try {
    const { report, generatedAt, notify, reused } = await generateWeeklyReport({
      courseId,
      weekStart: body.weekStart as string | undefined,
    });
    await recordAudit({
      actorRole: actor.role,
      actorId: actor.viaLti ? actor.userId : undefined,
      action: "create",
      entity: "weekly_report",
      entityId: report.weekStart,
      after: {
        courseId,
        generatedAt,
        reused: reused ?? false,
        studentCount: report.summary.studentCount,
        alertCount: report.alerts.length,
        notify: notify.state,
      },
    });
    return NextResponse.json({
      reused: reused ?? false,
      weekStart: report.weekStart,
      generatedAt,
      studentCount: report.summary.studentCount,
      alertCount: report.alerts.length,
      notify,
    });
  } catch (error) {
    if (error instanceof WeeklyReportBusyError) {
      return new NextResponse("週次レポートまたは保持期限処理が実行中です。処理の完了後に確認してください", { status: 503 });
    }
    return new NextResponse("処理結果を確認できませんでした。保存済みレポート・通知・監査の状況を確認してから再実行してください", { status: 500 });
  }
}
