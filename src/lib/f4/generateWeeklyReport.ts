import { getRoster } from "@/lib/roster";
import { withWeeklyReportLock } from "@/lib/db/client";
import { saveCourseReport, readCourseReport, recordCourseReportNotification, claimCourseReportNotification } from "./courseReportStore";
import { getAllLessonRecords, getPendingAssignmentsByStudent } from "@/lib/f3/store";
import { notifyWeeklyReport, type NotifyResult } from "./notifyReport";
import { buildWeeklyReport, type WeeklyReport } from "./weeklyReport";
import { currentReportWeek, isReportWeek } from "./reportWeek";

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
  reused?: boolean;
}

export interface StoredWeeklyReport {
  report: WeeklyReport;
  generatedAt: string;
  notifiedAt: string | null;
  notifySkippedReason: string | null;
}

/** 対象週を決めてレポートを生成・保存・通知する。weekStart省略時は実行日の週 */
export async function generateWeeklyReport(options: {
  courseId?: string;
  weekStart?: string;
  now?: Date;
  /** テスト用に通知処理を差し替える */
  notify?: (report: WeeklyReport) => Promise<NotifyResult>;
} = {}): Promise<GenerateResult> {
  const courseId = options.courseId;
  if (!courseId?.trim()) throw new Error("A report course is required");
  const now = options.now ?? new Date();
  const weekStart = options.weekStart ?? currentReportWeek(now);
  if (!isReportWeek(weekStart)) throw new Error("Report week must be a valid Monday");

  return withWeeklyReportLock(async (db) => {
    // The lock owns a single connection; do not submit overlapping queries to it.
    const recordsByStudent = await getAllLessonRecords(courseId, db);
    const pendingByStudent = await getPendingAssignmentsByStudent(courseId, db, weekStart);
    const students = await getRoster(courseId, db);
    const report = buildWeeklyReport({ weekStart, students, recordsByStudent, pendingByStudent });
    const generationId = await saveCourseReport(courseId, report, now, db);
    if (!await claimCourseReportNotification(courseId, weekStart, generationId, db)) {
      const stored = await readCourseReport(courseId, weekStart, db);
      if (!stored) throw new Error("Report snapshot is unavailable; verify before retrying");
      return {
        report: stored.report, generatedAt: stored.generatedAt, reused: true,
        notify: { state: "skipped", reason: "別の生成処理または通知開始の記録があるため再送しません。保存済みの通知状況を確認してください" },
      };
    }
    const notify = options.notify
      ? await options.notify(report)
      : await notifyWeeklyReport(report, undefined, courseId);
    if (!await recordCourseReportNotification(courseId, weekStart, generationId, notify, undefined, db)) {
      throw new Error("Notification result could not be recorded; verify before retrying");
    }
    return { report, generatedAt: now.toISOString(), notify };
  });
}

/** 保存済みの最新レポート（1件も無ければ null） */
export async function getLatestWeeklyReport(courseId?: string | null): Promise<StoredWeeklyReport | null> {
  if (!courseId?.trim()) return null;
  return readCourseReport(courseId);
}

/** 指定週の保存済みレポート */
export async function getWeeklyReport(weekStart: string, courseId?: string | null): Promise<StoredWeeklyReport | null> {
  if (!courseId?.trim()) return null;
  return readCourseReport(courseId, weekStart);
}
