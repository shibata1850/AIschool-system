import type { CurrentUser } from "@/lib/auth";

export interface CourseAccess {
  /** null is exclusively the isolated development/test dataset, never all courses. */
  courseId: string | null;
}

/** Staff may read across courses; write targets still use explicit course checks. */
export function canReadAllCourses(
  actor: CurrentUser,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (actor.role !== "teacher" && actor.role !== "admin") return false;
  return actor.viaLti === true || env.NODE_ENV === "test" ||
    (env.NODE_ENV === "development" && env.DEV_COOKIE_ROLES === "1");
}

export function courseAccess(
  actor: CurrentUser,
  env: Record<string, string | undefined> = process.env,
): CourseAccess | null {
  if (!["student", "teacher", "admin"].includes(actor.role)) return null;
  if (actor.viaLti) {
    const courseId = actor.courseId?.trim();
    return courseId ? { courseId } : null;
  }
  if (env.NODE_ENV === "test" ||
      (env.NODE_ENV === "development" && env.DEV_COOKIE_ROLES === "1")) {
    return { courseId: null };
  }
  return null;
}

export function teacherCourseAccess(
  actor: CurrentUser,
  env: Record<string, string | undefined> = process.env,
): CourseAccess | null {
  return actor.role === "teacher" || actor.role === "admin" ? courseAccess(actor, env) : null;
}
