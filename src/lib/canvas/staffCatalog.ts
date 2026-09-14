import type { CurrentUser } from "@/lib/auth";
import { canReadAllCourses } from "@/lib/course/access";
import type { CanvasClient, CanvasCourse } from "./client";
import { toErrorMessage } from "./errorMessage";

export type StaffCatalog =
  | { state: "notConfigured" }
  | { state: "error"; message: string }
  | { state: "ok"; courses: CanvasCourse[]; selected: CanvasCourse | null };

/** Read-only numeric selection. Never pass this value as a verified LTI write context. */
export async function resolveStaffCatalog(
  actor: CurrentUser,
  client: CanvasClient | null,
  requested?: string | string[],
): Promise<StaffCatalog> {
  if (!canReadAllCourses(actor)) throw new Error("Forbidden");
  if (!client) return { state: "notConfigured" };
  if (Array.isArray(requested) || (requested !== undefined && requested !== "" && !/^[1-9]\d*$/.test(requested))) {
    return { state: "error", message: "コースの指定が正しくありません" };
  }
  try {
    const courses = await client.listAccountCourses();
    if (requested !== undefined) {
      if (!requested) return { state: "ok", courses, selected: null };
      const selected = courses.find(course => String(course.id) === requested);
      return selected ? { state: "ok", courses, selected }
        : { state: "error", message: "指定されたコースが一覧にありません" };
    }
    // Preserve the launch context by matching IDs, not by choosing the first course.
    if (actor.courseId?.trim()) {
      const launched = await client.getCourseByLtiContext(actor.courseId.trim());
      const selected = courses.find(course => course.id === launched.id);
      if (!selected) return { state: "error", message: "起動元コースが一覧にありません" };
      return { state: "ok", courses, selected };
    }
    return { state: "ok", courses, selected: null };
  } catch (error) {
    return { state: "error", message: toErrorMessage(error) };
  }
}
