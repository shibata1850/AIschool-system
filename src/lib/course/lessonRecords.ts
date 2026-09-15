import { and, eq, sql } from "drizzle-orm";
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

export async function recordCourseCompletionScore(_courseId: string, _studentId: string, _score: number) {
  // The review transaction already persists the grade. Scoped learning reads derive it from
  // submissions and target_week; never copy it over an unrelated attendance record.
  return { state: "derived_from_submissions" as const };
}
