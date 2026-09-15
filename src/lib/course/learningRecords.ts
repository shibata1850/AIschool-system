import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/lib/db/client";
import { courseLessonRecords, submissions } from "@/lib/db/schema";
import type { LessonRecord } from "@/lib/f4/achievement";
import { isReportWeek } from "@/lib/f4/reportWeek";

type AttendanceInput = Pick<typeof courseLessonRecords.$inferSelect,
  "studentId" | "weekStart" | "lessonId" | "attended" | "dataMissing">;
type AssignmentInput = Pick<typeof submissions.$inferSelect,
  "id" | "studentId" | "targetWeek" | "status" | "submittedAt" | "teacherScore">;

export async function countUnscheduledAssignments(courseId: string, studentId: string, db: DbExecutor = getDb()) {
  const [row] = await db.select({ total: count() }).from(submissions)
    .where(and(eq(submissions.courseId, courseId), eq(submissions.studentId, studentId), isNull(submissions.targetWeek)));
  return row?.total ?? 0;
}

export function buildCourseLearningRecords(attendance: AttendanceInput[], assignments: AssignmentInput[]) {
  const byStudent = new Map<string, LessonRecord[]>();
  const add = (studentId: string, record: LessonRecord) => {
    const rows = byStudent.get(studentId) ?? [];
    rows.push(record);
    byStudent.set(studentId, rows);
  };
  for (const row of attendance) {
    if (!isReportWeek(row.weekStart)) continue;
    add(row.studentId, { lessonId: row.lessonId, weekStart: row.weekStart, source: "attendance",
      attended: row.attended, submitted: false, score: null, dataMissing: row.dataMissing });
  }
  for (const row of assignments) {
    // NULL legacy weeks remain unresolved; neither grading time nor submission time establishes a teaching week.
    if (!isReportWeek(row.targetWeek)) continue;
    add(row.studentId, { lessonId: row.id, weekStart: row.targetWeek, source: "assignment",
      attended: false, submitted: row.submittedAt !== null,
      score: row.status === "completed" ? row.teacherScore : null });
  }
  for (const rows of byStudent.values()) rows.sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.lessonId.localeCompare(b.lessonId));
  return byStudent;
}

export async function readCourseLearningRecords(courseId: string, studentId?: string, db: DbExecutor = getDb()) {
  // db may be the report's dedicated single connection.
  const attendance = await db.select({ studentId: courseLessonRecords.studentId, weekStart: courseLessonRecords.weekStart,
      lessonId: courseLessonRecords.lessonId, attended: courseLessonRecords.attended, dataMissing: courseLessonRecords.dataMissing })
      .from(courseLessonRecords).where(and(eq(courseLessonRecords.courseId, courseId),
        studentId === undefined ? undefined : eq(courseLessonRecords.studentId, studentId)));
  const assignments = await db.select({ id: submissions.id, studentId: submissions.studentId, targetWeek: submissions.targetWeek,
      status: submissions.status, submittedAt: submissions.submittedAt, teacherScore: submissions.teacherScore })
      .from(submissions).where(and(eq(submissions.courseId, courseId), isNotNull(submissions.targetWeek),
        studentId === undefined ? undefined : eq(submissions.studentId, studentId)));
  return buildCourseLearningRecords(attendance, assignments);
}
