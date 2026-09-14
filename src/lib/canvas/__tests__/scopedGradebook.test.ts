import { describe, expect, it, vi } from "vitest";
import { CanvasApiError, type CanvasClient } from "../client";
import { resolveScopedGradebook } from "../gradebook";

function fixture() {
  const methods = {
    listCourses: vi.fn(),
    getCourseByLtiContext: vi.fn(async () => ({ id: 7, name: "Course A", lti_context_id: "course-a" })),
    listAssignments: vi.fn(async () => [
      { id: 800, name: "Other assignment", published: true },
      { id: 900, name: "Selected assignment", published: true },
      { id: 901, name: "Draft", published: false },
    ]),
    listStudents: vi.fn(async () => [{ id: 501, name: "Test student A" }, { id: 502, name: "Test student B" }]),
    listSubmissions: vi.fn(async () => [{ user_id: 501, score: 0, workflow_state: "graded" }]),
  };
  return { methods, client: methods as unknown as CanvasClient };
}

describe("scoped Canvas gradebook", () => {
  it("uses only the explicit course and assignment, not the first assignment", async () => {
    const { client, methods } = fixture();
    const result = await resolveScopedGradebook(client, "course-a", 900);
    expect(result.state).toBe("ok");
    if (result.state !== "ok") throw new Error("Expected gradebook");
    expect(result.assignment.id).toBe(900);
    expect(result.rows.map(row => row.score)).toEqual([0, null]);
    expect(methods.getCourseByLtiContext).toHaveBeenCalledWith("course-a");
    expect(methods.listAssignments).toHaveBeenCalledWith(7);
    expect(methods.listStudents).toHaveBeenCalledWith(7);
    expect(methods.listSubmissions).toHaveBeenCalledWith(7, 900);
    expect(methods.listCourses).not.toHaveBeenCalled();
  });

  it.each([999, 901])("does not read submissions for unavailable assignment %s", async (assignmentId) => {
    const { client, methods } = fixture();
    expect((await resolveScopedGradebook(client, "course-a", assignmentId)).state).toBe("noAssignment");
    expect(methods.listStudents).not.toHaveBeenCalled();
    expect(methods.listSubmissions).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])("rejects invalid assignment %s before fetch", async (id) => {
    const { client, methods } = fixture();
    expect((await resolveScopedGradebook(client, "course-a", id)).state).toBe("error");
    expect(methods.getCourseByLtiContext).not.toHaveBeenCalled();
  });

  it("rejects blank course before fetch", async () => {
    const { client, methods } = fixture();
    expect((await resolveScopedGradebook(client, " ", 900)).state).toBe("error");
    expect(methods.getCourseByLtiContext).not.toHaveBeenCalled();
  });

  it("does not fall back after a course lookup fails or expose API response bodies", async () => {
    const { client, methods } = fixture();
    methods.getCourseByLtiContext.mockRejectedValue(new CanvasApiError(404, "private response"));
    const result = await resolveScopedGradebook(client, "course-a", 900);
    expect(result.state).toBe("error");
    expect(JSON.stringify(result)).not.toContain("private response");
    expect(methods.listCourses).not.toHaveBeenCalled();
    expect(methods.listAssignments).not.toHaveBeenCalled();
  });
});
