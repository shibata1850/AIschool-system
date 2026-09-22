import { and, count, eq, isNotNull, isNull, inArray, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/lib/db/client";
import { courseLessonRecords, submissions, canvasAssignmentLinks, students } from "@/lib/db/schema";
import {readCurrentQuizGrades} from '../quiz-review/grade-store';
import {quizAchievementRecords} from '../quiz-review/achievement-records';
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
  const records=buildCourseLearningRecords(attendance, assignments);
  if(process.env.QUIZ_ACHIEVEMENT_ENABLED==='true'){
    const instance=process.env.CANVAS_REVIEW_INSTANCE;
    if(!instance)throw new Error('小テスト成績の保存元を確認してください');
    const saved=await readCurrentQuizGrades(courseId,studentId,instance,db);
    const identities=saved.length?await db.select({id:students.id,canvasId:students.canvasUserId}).from(students).where(and(
      inArray(students.id,[...new Set(saved.map(g=>g.studentId))]),
      sql`(SELECT count(*) FROM students s WHERE s.canvas_user_id = ${students.canvasUserId}) = 1`)):[];
    const grades=saved.filter(g=>identities.some(p=>p.id===g.studentId&&p.canvasId!==null&&p.canvasId===g.snapshot.canvasUserId));
    const links=await db.select({id:canvasAssignmentLinks.canvasAssignmentId}).from(canvasAssignmentLinks).where(eq(canvasAssignmentLinks.courseId,courseId));
    for(const id of new Set(grades.map(g=>g.studentId))){
      const converted=quizAchievementRecords(grades.filter(g=>g.studentId===id).map(g=>g.snapshot),{
        courseId,studentId:id,sourceInstance:instance,linkedAssignmentIds:links.map(l=>l.id)});
      const rows=[...(records.get(id)??[]),...converted.records];
      rows.sort((a,b)=>a.weekStart.localeCompare(b.weekStart)||a.lessonId.localeCompare(b.lessonId));records.set(id,rows);
    }
  }
  return records;
}
