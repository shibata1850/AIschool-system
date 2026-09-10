import type { CurrentUser } from "@/lib/auth";

export function allocationScope(actor: CurrentUser): string | null {
  if (!actor.viaLti || !["teacher", "admin"].includes(actor.role)) return null;
  return actor.courseId?.trim() || null;
}

export function parseAllocation(input: unknown): {assignmentId:string;studentIds:string[]} | null {
  if (!input || typeof input !== "object") return null;
  const {assignmentId,studentIds} = input as Record<string,unknown>;
  if (typeof assignmentId !== "string" || !assignmentId.trim() || assignmentId.length > 200 ||
      !Array.isArray(studentIds) || studentIds.length === 0 || studentIds.length > 100 ||
      !studentIds.every(id => typeof id === "string" && id.trim() && id.length <= 200)) return null;
  return {assignmentId,studentIds:[...new Set(studentIds as string[])]};
}

export function emptyAssignmentLabel(hasAssignments: boolean): string {
  return hasAssignments ? "すべて完了しています。" : "まだ課題が割り当てられていません。";
}
