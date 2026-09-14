import { and, eq, sql, type SQLWrapper } from "drizzle-orm";
import type { DbExecutor } from "@/lib/db/client";
import { courseWeeklyReports, weeklyReports } from "@/lib/db/schema";
import { redactReportStudent, type WeeklyReport } from "@/lib/f4/weeklyReport";

export function reportContainsStudent(payload: SQLWrapper, studentId: string) {
  if (!studentId.trim()) throw new Error("A student ID is required");
  return sql`(${payload} @> ${JSON.stringify({ rows: [{ studentId }] })}::jsonb OR ${payload} @> ${JSON.stringify({ alerts: [{ studentId }] })}::jsonb)`;
}

/** Caller holds the weekly lock and a transaction. Never remove notification claim metadata. */
export async function redactStoredWeeklyReports(db: DbExecutor, studentId: string): Promise<void> {
  const legacy = await db.select().from(weeklyReports)
    .where(reportContainsStudent(weeklyReports.payload, studentId)).for("update");
  for (const row of legacy) {
    await db.update(weeklyReports).set({ payload: redactReportStudent(row.payload as WeeklyReport, studentId) })
      .where(eq(weeklyReports.weekStart, row.weekStart));
  }
  const scoped = await db.select().from(courseWeeklyReports)
    .where(reportContainsStudent(courseWeeklyReports.payload, studentId)).for("update");
  for (const row of scoped) {
    await db.update(courseWeeklyReports).set({ payload: redactReportStudent(row.payload as WeeklyReport, studentId) })
      .where(and(eq(courseWeeklyReports.courseId, row.courseId), eq(courseWeeklyReports.weekStart, row.weekStart)));
  }
}
