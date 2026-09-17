import { eq, sql } from "drizzle-orm";
import type { CurrentUser } from "@/lib/auth";
import { getDb, type DbExecutor } from "@/lib/db/client";
import { auditLog, courseTrainingDays, courseTrainingSettings } from "@/lib/db/schema";
import { canReadAllCourses, courseAccess, teacherCourseAccess } from "./access";
import { parseTrainingSettings, type TrainingLinkPolicy } from "./trainingPolicy";

export class TrainingSettingsError extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 409) { super(message); }
}

async function readSettings(db: DbExecutor, courseId: string) {
  // One statement gives a consistent snapshot of the setting and its days.
  const rows = await db.select({ settings: courseTrainingSettings, day: courseTrainingDays })
    .from(courseTrainingSettings).leftJoin(courseTrainingDays,
      eq(courseTrainingSettings.courseId, courseTrainingDays.courseId))
    .where(eq(courseTrainingSettings.courseId, courseId));
  if (!rows.length) return null;
  const { mode, currentDay, revision } = rows[0].settings;
  return { courseId, mode, currentDay, revision, days: rows.flatMap(({ day }) => day ? [{
    day: day.day, title: day.title, materialUrl: day.materialUrl, quizUrl: day.quizUrl,
  }] : []).sort((a, b) => a.day - b.day) };
}

export async function readTrainingSettings(actor: CurrentUser, courseId: string) {
  const access = courseAccess(actor);
  if (!courseId.trim() || (!canReadAllCourses(actor) && access?.courseId !== courseId)) {
    throw new TrainingSettingsError("このコースの授業設定は閲覧できません", 403);
  }
  return readSettings(getDb(), courseId);
}

/** links must come from a verified, course-specific server catalog, never the request. */
export async function saveTrainingSettings(actor: CurrentUser, input: unknown, links: TrainingLinkPolicy) {
  const courseId = teacherCourseAccess(actor)?.courseId;
  if (!courseId || !actor.userId.trim()) {
    throw new TrainingSettingsError("Canvasのコースから講師として起動してください", 403);
  }
  const settings = parseTrainingSettings(input, courseId, links);
  if (!settings || settings.revision >= 2147483647) {
    throw new TrainingSettingsError("授業設定の入力内容を確認してください", 400);
  }
  return getDb().transaction(async tx => {
    // Lock absent settings too, so simultaneous first saves cannot overwrite each other.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["course-training", courseId])}, 0))`);
    const before = await readSettings(tx, courseId);
    if ((before?.revision ?? 0) !== settings.revision) {
      throw new TrainingSettingsError("別の変更が保存されています。再読み込みしてください", 409);
    }
    const at = new Date();
    const after = { ...settings, revision: settings.revision + 1 };
    const values = { courseId, mode: after.mode, currentDay: after.currentDay,
      revision: after.revision, updatedAt: at, updatedBy: actor.userId };
    await tx.insert(courseTrainingSettings).values(values).onConflictDoUpdate({
      target: courseTrainingSettings.courseId, set: values,
    });
    await tx.delete(courseTrainingDays).where(eq(courseTrainingDays.courseId, courseId));
    if (after.days.length) {
      await tx.insert(courseTrainingDays).values(after.days.map(day => ({ ...day, courseId })));
    }
    await tx.insert(auditLog).values({ at, actorRole: actor.role, actorId: actor.userId,
      action: before ? "update" : "create", entity: "course_training_settings",
      entityId: courseId, before, after });
    return after;
  });
}
