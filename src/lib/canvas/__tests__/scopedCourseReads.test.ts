import { describe, expect, it, vi } from "vitest";
import type { CanvasClient } from "../client";
import { resolveCourseData } from "../courseData";
import { resolveClassSummary } from "../classSummary";

describe.each([resolveCourseData, resolveClassSummary])("Canvas course read boundary (%#)", resolve => {
  function fixture() {
    const methods = {
      listCourses: vi.fn(async () => [{ id: 1, name: "Wrong course" }]),
      getCourseByLtiContext: vi.fn(async () => ({ id: 7, name: "Own course", lti_context_id: "course-a" })),
      listStudents: vi.fn(async () => [{ id: 501, name: "Fictional learner" }]),
      listAssignments: vi.fn(async () => [{ id: 900, name: "Fictional exercise", description: null, due_at: null, published: true, points_possible: 100 }]),
      listSubmissions: vi.fn(async (_courseId: number, _assignmentId: number) => []),
    };
    return { methods, client: methods as unknown as CanvasClient };
  }
  it("uses only the verified course for roster, assignments and scores", async () => {
    const { methods, client } = fixture();
    const result = await resolve(client, "course-a");
    expect(result.state).toBe("ok");
    expect(methods.getCourseByLtiContext).toHaveBeenCalledWith("course-a");
    expect(methods.listStudents).toHaveBeenCalledWith(7);
    expect(methods.listAssignments).toHaveBeenCalledWith(7);
    expect(methods.listCourses).not.toHaveBeenCalled();
    for (const call of methods.listSubmissions.mock.calls) expect(call[0]).toBe(7);
  });
  it.each([undefined, null, "", " "])("rejects missing course %s without reading Canvas", async course => {
    const { methods, client } = fixture();
    expect((await resolve(client, course)).state).toBe("error");
    expect(methods.listCourses).not.toHaveBeenCalled();
    expect(methods.getCourseByLtiContext).not.toHaveBeenCalled();
    expect(methods.listStudents).not.toHaveBeenCalled();
  });
  it("does not fall back to another course after lookup failure", async () => {
    const { methods, client } = fixture();
    methods.getCourseByLtiContext.mockRejectedValue(new Error("private details"));
    const result = await resolve(client, "course-a");
    expect(result.state).toBe("error");
    expect(JSON.stringify(result)).not.toContain("private details");
    expect(methods.listCourses).not.toHaveBeenCalled();
    expect(methods.listStudents).not.toHaveBeenCalled();
  });
});
