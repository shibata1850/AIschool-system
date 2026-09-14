import { and, eq, sql } from "drizzle-orm";
import type { CurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { assignments, auditLog, canvasAssignmentLinks } from "@/lib/db/schema";
import { createCanvasClient, type CanvasClient } from "./client";
import { AssignmentLinkError, validateAssignmentLink } from "./assignmentLinkPolicy";

export async function listCanvasAssignmentLinks(courseId: string) {
  if (!courseId.trim()) return [];
  return getDb().select({ assignmentId: canvasAssignmentLinks.assignmentId,
    canvasAssignmentId: canvasAssignmentLinks.canvasAssignmentId })
    .from(canvasAssignmentLinks).where(eq(canvasAssignmentLinks.courseId, courseId));
}

export async function getCanvasAssignmentLink(courseId: string | null, assignmentId: string) {
  if (!courseId?.trim()) return undefined;
  const [row] = await getDb().select().from(canvasAssignmentLinks).where(and(
    eq(canvasAssignmentLinks.courseId, courseId), eq(canvasAssignmentLinks.assignmentId, assignmentId),
  ));
  return row;
}

export async function createCanvasAssignmentLink(
  actor: CurrentUser, assignmentId: string, canvasAssignmentId: number,
  client: CanvasClient | null = createCanvasClient(),
) {
  const link = await validateAssignmentLink(actor, assignmentId, canvasAssignmentId, client);
  return getDb().transaction(async tx => {
    // One course lock also serializes two exercises competing for the same Canvas target.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["canvas-assignment-link", link.courseId])}, 0))`);
    const [exercise] = await tx.select({ id: assignments.id }).from(assignments).where(eq(assignments.id, assignmentId));
    if (!exercise) throw new AssignmentLinkError("演習が見つかりません", 400);
    const existing = await tx.select().from(canvasAssignmentLinks).where(eq(canvasAssignmentLinks.courseId, link.courseId));
    const current = existing.find(item => item.assignmentId === assignmentId);
    if (current) {
      if (current.canvasAssignmentId === canvasAssignmentId) return { created: false };
      throw new AssignmentLinkError("この演習のCanvas対応は登録済みです。既存の対応は変更しません", 409);
    }
    if (existing.some(item => item.canvasAssignmentId === canvasAssignmentId)) {
      throw new AssignmentLinkError("このCanvas課題は別の演習に対応済みです", 409);
    }
    const at = new Date();
    await tx.insert(canvasAssignmentLinks).values({ ...link, createdAt: at, createdBy: actor.userId });
    await tx.insert(auditLog).values({ at, actorRole: actor.role, actorId: actor.userId,
      action: "create", entity: "canvas_assignment_link", entityId: JSON.stringify([link.courseId, assignmentId]),
      after: link,
    });
    return { created: true };
  });
}
