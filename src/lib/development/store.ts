import { and, eq, sql } from "drizzle-orm";
import type { CurrentUser } from "@/lib/auth";
import { canReadAllCourses, courseAccess } from "@/lib/course/access";
import { getDb, type DbExecutor } from "@/lib/db/client";
import { auditLog, courseTrainingSettings, courseTrainingDays, developmentProjects as projects,
  developmentSessions as sessions, developmentAttendance as attendance, studentCourses, students } from "@/lib/db/schema";
import { attendanceLabels, projectUrl, record, shortText, type Attendance, type WorkMode } from "./policy";

export class DevelopmentError extends Error {
  constructor(message: string, public status: 400 | 403 | 409) { super(message); }
}
function scope(actor: CurrentUser, courseId: string, studentId?: string) {
  if (!actor.viaLti || !courseId || !actor.userId ||
      (!canReadAllCourses(actor) && (actor.role !== "student" || courseAccess(actor)?.courseId !== courseId || studentId !== actor.userId))) {
    throw new DevelopmentError("この情報にはアクセスできません", 403);
  }
}
async function enabled(db: DbExecutor, courseId: string) {
  const [setting] = await db.select().from(courseTrainingSettings).where(eq(courseTrainingSettings.courseId, courseId));
  if (setting?.mode !== "development") throw new DevelopmentError("システム開発コースではありません", 403);
  return setting;
}
const owner = (table: typeof projects | typeof sessions | typeof attendance, courseId: string, studentId: string) =>
  and(eq(table.courseId, courseId), eq(table.studentId, studentId));

export async function readDevelopment(actor: CurrentUser, courseId: string, studentId: string, day: number | null) {
  scope(actor, courseId, studentId);
  const db = getDb();
  await enabled(db, courseId);
  const [project] = await db.select().from(projects).where(owner(projects, courseId, studentId));
  const [session] = day === null ? [] : await db.select().from(sessions).where(and(owner(sessions, courseId, studentId), eq(sessions.day, day)));
  const [presence] = day === null ? [] : await db.select().from(attendance).where(and(owner(attendance, courseId, studentId), eq(attendance.day, day)));
  return { project: project ?? null, session: session ?? null, attendance: presence ?? null };
}

export async function listDevelopment(actor: CurrentUser, courseId: string, day: number | null) {
  scope(actor, courseId);
  if (!canReadAllCourses(actor)) throw new DevelopmentError("講師権限が必要です", 403);
  const db = getDb();
  await enabled(db, courseId);
  return db.select({ studentId: students.id, displayName: students.displayName, project: projects, session: sessions, attendance })
    .from(studentCourses).innerJoin(students, eq(students.id, studentCourses.studentId))
    .leftJoin(projects, and(eq(projects.courseId, studentCourses.courseId), eq(projects.studentId, studentCourses.studentId)))
    .leftJoin(sessions, and(eq(sessions.courseId, studentCourses.courseId), eq(sessions.studentId, studentCourses.studentId), eq(sessions.day, day ?? -1)))
    .leftJoin(attendance, and(eq(attendance.courseId, studentCourses.courseId), eq(attendance.studentId, studentCourses.studentId), eq(attendance.day, day ?? -1)))
    .where(eq(studentCourses.courseId, courseId)).orderBy(students.displayName);
}

export async function saveDevelopment(actor: CurrentUser, input: unknown) {
  if (!record(input) || typeof input.courseId !== "string" || typeof input.studentId !== "string" ||
      !Number.isSafeInteger(input.revision) || (input.revision as number) < 0 || (input.revision as number) >= 2147483647) {
    throw new DevelopmentError("入力内容を確認してください", 400);
  }
  const { courseId, studentId } = input;
  const expectedRevision = input.revision;
  const kind = input.kind;
  scope(actor, courseId, studentId);
  const staff = canReadAllCourses(actor);
  if (courseAccess(actor)?.courseId !== courseId ||
      (staff ? input.kind !== "attendance" && input.kind !== "resolve" : input.kind !== "project" && input.kind !== "session")) {
    throw new DevelopmentError("この操作は許可されていません", 403);
  }
  return getDb().transaction(async tx => {
    // Share the settings lock so a lesson switch cannot race with a learner save.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["course-training", courseId])}, 0))`);
    const setting = await enabled(tx, courseId);
    const [member] = await tx.select({ id: studentCourses.studentId }).from(studentCourses)
      .where(and(eq(studentCourses.courseId, courseId), eq(studentCourses.studentId, studentId)));
    if (!member) throw new DevelopmentError("コースの受講者を確認できません", 403);
    const day = input.day;
    if (input.kind !== "project") {
      if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 10) throw new DevelopmentError("授業回を選択してください", 400);
      const [lesson] = await tx.select({ day: courseTrainingDays.day }).from(courseTrainingDays)
        .where(and(eq(courseTrainingDays.courseId, courseId), eq(courseTrainingDays.day, day)));
      if (!lesson || (!staff && setting.currentDay !== day)) throw new DevelopmentError("現在の授業が変わりました。再読み込みしてください", 409);
    }
    const at = new Date();
    const meta = { courseId, studentId, revision: (input.revision as number) + 1, updatedAt: at, updatedBy: actor.userId };
    function revision(before: { revision: number } | undefined) {
      if ((before?.revision ?? 0) !== expectedRevision) throw new DevelopmentError("別の変更が保存されています。再読み込みしてください", 409);
    }
    async function audit(entity: string, before: unknown, after: unknown) {
      await tx.insert(auditLog).values({ at, actorRole: actor.role, actorId: actor.userId, action: before ? "update" : "create",
        entity, entityId: JSON.stringify([courseId, studentId, kind === "project" ? null : day]), before: before ?? null, after });
    }
    if (input.kind === "project") {
      const editorUrl = projectUrl(input.editorUrl), previewUrl = projectUrl(input.previewUrl);
      if (!shortText(input.name, 120) || !shortText(input.problem, 1000) || editorUrl === undefined || previewUrl === undefined) {
        throw new DevelopmentError("名前・困りごと、またはURLを確認してください。URLは認証情報・クエリ・フラグメントを含まないHTTPS形式にしてください", 400);
      }
      const [before] = await tx.select().from(projects).where(owner(projects, courseId, studentId)); revision(before);
      const after = { ...meta, name: input.name.trim(), problem: input.problem.trim(), editorUrl, previewUrl };
      await tx.insert(projects).values(after).onConflictDoUpdate({ target: [projects.courseId, projects.studentId], set: after });
      await audit("development_project", before, after); return after;
    }
    if (input.kind === "attendance") {
      if (typeof input.status !== "string" || !Object.hasOwn(attendanceLabels, input.status)) throw new DevelopmentError("出席状態が不正です", 400);
      const [before] = await tx.select().from(attendance).where(and(owner(attendance, courseId, studentId), eq(attendance.day, day as number))); revision(before);
      const after = { ...meta, day: day as number, status: input.status as Attendance };
      await tx.insert(attendance).values(after).onConflictDoUpdate({ target: [attendance.courseId, attendance.studentId, attendance.day], set: after });
      await audit("development_attendance", before, after); return after;
    }
    const [before] = await tx.select().from(sessions).where(and(owner(sessions, courseId, studentId), eq(sessions.day, day as number))); revision(before);
    if (input.kind === "resolve") {
      if (!before || before.help !== "requested") throw new DevelopmentError("相談状況が変わりました。再読み込みしてください", 409);
      const after = { ...before, ...meta, help: "resolved" as const };
      await tx.update(sessions).set(after).where(and(owner(sessions, courseId, studentId), eq(sessions.day, day as number)));
      await audit("development_session", before, after); return after;
    }
    if ((input.mode !== null && input.mode !== "reading" && input.mode !== "developing") ||
        !shortText(input.difficulty, 1000) || !shortText(input.nextStep, 1000) || typeof input.requestHelp !== "boolean") {
      throw new DevelopmentError("作業状況の入力内容を確認してください", 400);
    }
    const after = { ...meta, day: day as number, mode: input.mode as WorkMode | null,
      difficulty: input.difficulty.trim(), nextStep: input.nextStep.trim(),
      help: input.requestHelp ? "requested" as const : before?.help === "resolved" ? "resolved" as const : "none" as const };
    await tx.insert(sessions).values(after).onConflictDoUpdate({ target: [sessions.courseId, sessions.studentId, sessions.day], set: after });
    await audit("development_session", before, after); return after;
  });
}
