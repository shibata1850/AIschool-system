import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { courseLessonRecords as records } from "@/lib/db/schema";

const key = (courseId: string, studentId: string, weekStart: string) => and(
  eq(records.courseId, courseId), eq(records.studentId, studentId), eq(records.weekStart, weekStart),
);

export async function listCourseLessonRecords(courseId: string, studentId: string) {
  return getDb().select().from(records)
    .where(and(eq(records.courseId, courseId), eq(records.studentId, studentId)))
    .orderBy(records.weekStart);
}

export async function getCourseAttendance(courseId: string, studentId: string, weekStart: string) {
  const [row] = await getDb().select({ attended: records.attended }).from(records)
    .where(key(courseId, studentId, weekStart)).limit(1);
  return row?.attended;
}

export async function setCourseAttendance(courseId: string, studentId: string, weekStart: string, attended: boolean) {
  return getDb().transaction(async (tx) => {
    // Also serializes the first insert, where there is no row to lock yet.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["attendance", courseId, studentId, weekStart])}, 0))`);
    const [existing] = await tx.select().from(records).where(key(courseId, studentId, weekStart)).limit(1);
    if (existing && existing.attended === attended && !existing.dataMissing) {
      return { before: existing.attended, changed: false };
    }
    if (existing) {
      await tx.update(records).set({ attended, dataMissing: false }).where(key(courseId, studentId, weekStart));
    } else {
      await tx.insert(records).values({ courseId, studentId, lessonId: `w-${weekStart}`, weekStart, attended, submitted: false, score: null, dataMissing: false });
    }
    return { before: existing ? existing.attended : "none" as const, changed: true };
  });
}

export async function recordCourseCompletionScore(courseId: string, studentId: string, score: number) {
  const db = getDb();
  const [latest] = await db.select({ weekStart: records.weekStart }).from(records)
    .where(and(eq(records.courseId, courseId), eq(records.studentId, studentId)))
    .orderBy(desc(records.weekStart)).limit(1);
  if (!latest) return;
  await db.update(records).set({ submitted: true, score }).where(key(courseId, studentId, latest.weekStart));
}
