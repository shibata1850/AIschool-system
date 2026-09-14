import { describe, expect, it, vi } from "vitest";
import type { CanvasClient } from "../client";
import { validateAssignmentLink } from "../assignmentLinkPolicy";

const actor = { role: "teacher" as const, userId: "fictional-teacher", viaLti: true, courseId: "course-a" };
function fixture() {
  const course = vi.fn(async () => ({ id: 7, name: "Course A", lti_context_id: "course-a" }));
  const assignments = vi.fn(async () => [{ id: 900, name: "Exercise A", published: true, points_possible: 100 }]);
  return { course, assignments, client: { getCourseByLtiContext: course, listAssignments: assignments } as unknown as CanvasClient };
}

describe("explicit Canvas assignment link policy", () => {
  it("validates the target against the teacher's course", async () => {
    const { client, course, assignments } = fixture();
    expect(await validateAssignmentLink(actor, "a1", 900, client)).toEqual({ courseId: "course-a", assignmentId: "a1", canvasAssignmentId: 900 });
    expect(course).toHaveBeenCalledWith("course-a");
    expect(assignments).toHaveBeenCalledWith(7);
  });
  it.each(["student", "guest"] as const)("rejects %s before Canvas access", async role => {
    const { client, course } = fixture();
    await expect(validateAssignmentLink({ ...actor, role }, "a1", 900, client)).rejects.toMatchObject({ status: 403 });
    expect(course).not.toHaveBeenCalled();
  });
  it("rejects a teacher without a verified course", async () => {
    await expect(validateAssignmentLink({ ...actor, courseId: undefined }, "a1", 900, fixture().client)).rejects.toMatchObject({ status: 403 });
  });
  it.each([0, -1, 1.5, 2147483648, NaN])("rejects invalid target %s", async id => {
    const { client, course } = fixture();
    await expect(validateAssignmentLink(actor, "a1", id, client)).rejects.toMatchObject({ status: 400 });
    expect(course).not.toHaveBeenCalled();
  });
  it("does not infer a target when Canvas is unconfigured", async () => {
    await expect(validateAssignmentLink(actor, "a1", 900, null)).rejects.toMatchObject({ status: 409 });
  });
  it("rejects an assignment outside the course", async () => {
    await expect(validateAssignmentLink(actor, "a1", 999, fixture().client)).rejects.toMatchObject({ status: 409 });
  });
  it("rejects unpublished assignments", async () => {
    const { client, assignments } = fixture();
    assignments.mockResolvedValue([{ id: 900, name: "Draft", published: false, points_possible: 100 }]);
    await expect(validateAssignmentLink(actor, "a1", 900, client)).rejects.toMatchObject({ status: 409 });
  });
  it("does not silently reinterpret a 100-point score for a different grading scale", async () => {
    const { client, assignments } = fixture();
    assignments.mockResolvedValue([{ id: 900, name: "Ten points", published: true, points_possible: 10 }]);
    await expect(validateAssignmentLink(actor, "a1", 900, client)).rejects.toMatchObject({ status: 409 });
  });
});
