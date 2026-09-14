import type { CurrentUser } from "@/lib/auth";
import { canReadAllCourses, teacherCourseAccess } from "./access";

export function staffCourseSelection(actor: CurrentUser, recorded: string[], requested?: string | string[]) {
  if (!canReadAllCourses(actor) || Array.isArray(requested)) return null;
  const access = teacherCourseAccess(actor);
  const courses = [...new Set([...recorded, ...(access?.courseId ? [access.courseId] : [])])].sort();
  const courseId = requested === undefined ? access?.courseId ?? courses[0] ?? null : requested || null;
  if (courseId !== null && !courses.includes(courseId)) return null;
  return { courses, courseId, canEdit: !!access && access.courseId === courseId };
}
