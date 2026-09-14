import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetStore } from "@/lib/f3/store";
import { getAdminDb } from "@/lib/db/adminClient";
import { assignments, auditLog, canvasAssignmentLinks } from "@/lib/db/schema";
import { createCanvasAssignmentLink, getCanvasAssignmentLink } from "@/lib/canvas/assignmentLinks";
import type { CanvasClient } from "@/lib/canvas/client";

const teacher = (courseId: string) => ({ role: "teacher" as const, userId: "fictional-teacher", viaLti: true, courseId });
const client = {
  getCourseByLtiContext: async (context: string) => ({ id: context === "course-a" ? 7 : 8, name: "Fictional course", lti_context_id: context }),
  listAssignments: async () => [900, 901].map(id => ({ id, name: "Fictional assignment", published: true, points_possible: 100 })),
} as unknown as CanvasClient;

describe("immutable course-specific Canvas assignment links", () => {
  beforeEach(async () => { await resetStore(); });

  it("separates the same exercise in two courses", async () => {
    await createCanvasAssignmentLink(teacher("course-a"), "a1", 900, client);
    await createCanvasAssignmentLink(teacher("course-b"), "a1", 901, client);
    expect((await getCanvasAssignmentLink("course-a", "a1"))?.canvasAssignmentId).toBe(900);
    expect((await getCanvasAssignmentLink("course-b", "a1"))?.canvasAssignmentId).toBe(901);
    expect(await getCanvasAssignmentLink("course-empty", "a1")).toBeUndefined();
    expect(await getCanvasAssignmentLink(null, "a1")).toBeUndefined();
  });

  it("serializes 16 duplicate registrations and audits creation once", async () => {
    const results = await Promise.all(Array.from({ length: 16 }, () => createCanvasAssignmentLink(teacher("course-a"), "a1", 900, client)));
    expect(results.filter(result => result.created)).toHaveLength(1);
    expect(await getAdminDb().select().from(canvasAssignmentLinks)).toHaveLength(1);
    const audit = await getAdminDb().select().from(auditLog).where(eq(auditLog.entity, "canvas_assignment_link"));
    expect(audit).toHaveLength(1);
  });

  it("does not change an existing target", async () => {
    await createCanvasAssignmentLink(teacher("course-a"), "a1", 900, client);
    await expect(createCanvasAssignmentLink(teacher("course-a"), "a1", 901, client)).rejects.toMatchObject({ status: 409 });
    expect((await getCanvasAssignmentLink("course-a", "a1"))?.canvasAssignmentId).toBe(900);
  });

  it("does not let two exercises overwrite the same Canvas grade", async () => {
    await getAdminDb().insert(assignments).values({ id: "fictional-a2", title: "Fictional exercise", description: "Fictional", charLimit: 100, deadline: "2099-01-01" });
    await createCanvasAssignmentLink(teacher("course-a"), "a1", 900, client);
    await expect(createCanvasAssignmentLink(teacher("course-a"), "fictional-a2", 900, client)).rejects.toMatchObject({ status: 409 });
    expect(await getCanvasAssignmentLink("course-a", "fictional-a2")).toBeUndefined();
  });

  it("does not record a link or audit for an unknown exercise", async () => {
    await expect(createCanvasAssignmentLink(teacher("course-a"), "unknown", 900, client)).rejects.toMatchObject({ status: 400 });
    expect(await getAdminDb().select().from(canvasAssignmentLinks)).toHaveLength(0);
    expect(await getAdminDb().select().from(auditLog).where(eq(auditLog.entity, "canvas_assignment_link"))).toHaveLength(0);
  });
});
