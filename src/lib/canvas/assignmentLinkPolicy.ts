import type { CurrentUser } from "@/lib/auth";
import { teacherCourseAccess } from "@/lib/course/access";
import type { CanvasClient } from "./client";

export class AssignmentLinkError extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 409) { super(message); }
}

export async function validateAssignmentLink(
  actor: CurrentUser, assignmentId: string, canvasAssignmentId: number, client: CanvasClient | null,
) {
  const access = teacherCourseAccess(actor);
  if (!access?.courseId || !actor.viaLti || !actor.userId) {
    throw new AssignmentLinkError("Canvasのコースから講師として起動してください", 403);
  }
  if (!assignmentId.trim() || !Number.isSafeInteger(canvasAssignmentId) || canvasAssignmentId <= 0 || canvasAssignmentId > 2147483647) {
    throw new AssignmentLinkError("演習とCanvas課題を選択してください", 400);
  }
  if (!client) throw new AssignmentLinkError("Canvasに接続していません", 409);
  const course = await client.getCourseByLtiContext(access.courseId);
  const assignments = await client.listAssignments(course.id);
  const target = assignments.find(item => item.id === canvasAssignmentId && item.published);
  if (!target) throw new AssignmentLinkError("このコースの公開中のCanvas課題を選択してください", 409);
  if (target.points_possible !== 100) {
    throw new AssignmentLinkError("演習の点数を反映するCanvas課題は100点満点にしてください", 409);
  }
  return { courseId: access.courseId, assignmentId, canvasAssignmentId };
}
