import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { weeklyReports } from "@/lib/db/schema";
import { getAllLessonRecords, getPendingAssignmentsByStudent } from "@/lib/f3/store";
import { STUDENTS } from "./fixtures";
import { notifyWeeklyReport, type NotifyResult } from "./notifyReport";
import { buildWeeklyReport, weekStartOf, type WeeklyReport } from "./weeklyReport";

/**
 * 週次到達度レポートの生成（要件定義書 9.2 F4①: 月曜7:00に自動生成し講師へ通知）。
 *
 * 収集 → 組み立て → 保存 → 通知 の順に行う。通知の失敗は生成を失敗させない
 * （レポートは残り、未通知の理由が記録される）。
 * 実行経路は2つ: cron（scripts/generate-weekly-report.ts）と管理者API（再生成用）。
 */

export interface GenerateResult {
  report: WeeklyReport;
  generatedAt: string;
  notify: NotifyResult;
}

export interface StoredWeeklyReport {
  report: WeeklyReport;
  generatedAt: string;
  notifiedAt: string | null;
  notifySkippedReason: string | null;
}

/** 対象週を決めてレポートを生成・保存・通知する。weekStart省略時は実行日の週 */
export async function generateWeeklyReport(options: {
  weekStart?: string;
  now?: Date;
  /** テスト用に通知処理を差し替える */
  notify?: (report: WeeklyReport) => Promise<NotifyResult>;
} = {}): Promise<GenerateResult> {
  const now = options.now ?? new Date();
  const weekStart = options.weekStart ?? weekStartOf(now);

  const [recordsByStudent, pendingByStudent] = await Promise.all([
    getAllLessonRecords(),
    getPendingAssignmentsByStudent(),
  ]);

  const report = buildWeeklyReport({
    weekStart,
    students: STUDENTS,
    recordsByStudent,
    pendingByStudent,
  });

  const notify = await (options.notify ?? notifyWeeklyReport)(report);
  const notifiedAt = notify.state === "sent" ? now : null;
  const notifySkippedReason = notify.state === "sent" ? null : notify.reason;

  const db = getDb();
  await db
    .insert(weeklyReports)
    .values({ weekStart, generatedAt: now, payload: report, notifiedAt, notifySkippedReason })
    .onConflictDoUpdate({
      target: weeklyReports.weekStart,
      set: { generatedAt: now, payload: report, notifiedAt, notifySkippedReason },
    });

  return { report, generatedAt: now.toISOString(), notify };
}

/** 保存済みの最新レポート（1件も無ければ null） */
export async function getLatestWeeklyReport(): Promise<StoredWeeklyReport | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(weeklyReports)
    .orderBy(desc(weeklyReports.weekStart))
    .limit(1);
  if (!row) return null;
  return {
    report: row.payload as WeeklyReport,
    generatedAt: row.generatedAt.toISOString(),
    notifiedAt: row.notifiedAt?.toISOString() ?? null,
    notifySkippedReason: row.notifySkippedReason,
  };
}

/** 指定週の保存済みレポート */
export async function getWeeklyReport(weekStart: string): Promise<StoredWeeklyReport | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.weekStart, weekStart))
    .limit(1);
  if (!row) return null;
  return {
    report: row.payload as WeeklyReport,
    generatedAt: row.generatedAt.toISOString(),
    notifiedAt: row.notifiedAt?.toISOString() ?? null,
    notifySkippedReason: row.notifySkippedReason,
  };
}
