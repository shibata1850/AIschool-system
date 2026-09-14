import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, isNotNull } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/lib/db/client";
import { courseWeeklyReports } from "@/lib/db/schema";
import type { WeeklyReport } from "./weeklyReport";
import type { NotifyResult } from "./notifyReport";

export function requireReportCourse(courseId: string): void {
  if (!courseId?.trim()) throw new Error("A report course is required");
}

export function reportGenerationFilter(courseId: string, weekStart: string, generationId: string) {
  requireReportCourse(courseId);
  if (!generationId.trim()) throw new Error("A report generation is required");
  return and(
    eq(courseWeeklyReports.courseId, courseId),
    eq(courseWeeklyReports.weekStart, weekStart),
    eq(courseWeeklyReports.generationId, generationId),
  );
}

export async function saveCourseReport(courseId: string, report: WeeklyReport, generatedAt: Date, db?: DbExecutor) {
  requireReportCourse(courseId);
  db ??= getDb();
  const generationId = randomUUID();
  const values = {
    courseId, weekStart: report.weekStart, generationId, generatedAt, payload: report,
    notifiedAt: null, notifySkippedReason: "通知処理は未完了です",
  };
  await db.insert(courseWeeklyReports).values(values).onConflictDoUpdate({
    target: [courseWeeklyReports.courseId, courseWeeklyReports.weekStart],
    set: values,
    setWhere: isNull(courseWeeklyReports.notificationClaimedAt),
  });
  return generationId;
}

/** Persist the claim before contacting Canvas. Never automatically release it on failure. */
export async function claimCourseReportNotification(courseId: string, weekStart: string, generationId: string, db?: DbExecutor): Promise<boolean> {
  const condition = reportGenerationFilter(courseId, weekStart, generationId);
  db ??= getDb();
  const rows = await db.update(courseWeeklyReports).set({
    notificationClaimedAt: new Date(),
    notifySkippedReason: "通知処理を開始しました。結果不明の場合は再送前に確認してください",
  }).where(and(condition, isNull(courseWeeklyReports.notificationClaimedAt)))
    .returning({ generationId: courseWeeklyReports.generationId });
  return rows.length === 1;
}

export async function recordCourseReportNotification(
  courseId: string, weekStart: string, generationId: string, result: NotifyResult, now = new Date(),
  db?: DbExecutor,
): Promise<boolean> {
  const condition = reportGenerationFilter(courseId, weekStart, generationId);
  db ??= getDb();
  const rows = await db.update(courseWeeklyReports).set({
    notifiedAt: result.state === "sent" ? now : null,
    notifySkippedReason: result.state === "sent" ? null : result.reason,
  }).where(and(condition, isNotNull(courseWeeklyReports.notificationClaimedAt)))
    .returning({ generationId: courseWeeklyReports.generationId });
  return rows.length === 1;
}

export async function readCourseReport(courseId: string, weekStart?: string, db?: DbExecutor) {
  requireReportCourse(courseId);
  db ??= getDb();
  const [row] = await db.select().from(courseWeeklyReports).where(and(
    eq(courseWeeklyReports.courseId, courseId),
    weekStart === undefined ? undefined : eq(courseWeeklyReports.weekStart, weekStart),
  )).orderBy(desc(courseWeeklyReports.weekStart)).limit(1);
  if (!row) return null;
  return {
    report: row.payload as WeeklyReport,
    generationId: row.generationId,
    generatedAt: row.generatedAt.toISOString(),
    notifiedAt: row.notifiedAt?.toISOString() ?? null,
    notificationClaimedAt: row.notificationClaimedAt?.toISOString() ?? null,
    notifySkippedReason: row.notifySkippedReason,
  };
}
