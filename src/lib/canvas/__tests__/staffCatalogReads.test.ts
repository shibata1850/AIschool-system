import { describe, expect, it, vi } from "vitest";
import type { CanvasClient } from "../client";
import { resolveStaffCatalog } from "../staffCatalog";
import { readCourseData } from "../courseData";
import { readClassSummary } from "../classSummary";

describe.each([readCourseData, readClassSummary])("selected Canvas course read (%#)", read => {
  it("reads only the numeric course selected from the account catalog", async () => {
    const methods = {
      listAccountCourses: vi.fn(async () => [{ id: 2, name: "Unlaunched course" }]),
      getCourseByLtiContext: vi.fn(),
      listStudents: vi.fn(async () => [{ id: 5, name: "Fictional learner" }]),
      listAssignments: vi.fn(async () => [{ id: 8, name: "Fictional assignment", published: true, description: null, due_at: null }]),
      listSubmissions: vi.fn(async (_course: number, _assignment: number) => [{ user_id: 5, submitted_at: "2026-09-14", score: 80 }]),
    };
    const client = methods as unknown as CanvasClient;
    const catalog = await resolveStaffCatalog({ role: "teacher", userId: "fictional", viaLti: true, courseId: "lti-other" }, client, "2");
    expect(catalog.state).toBe("ok");
    if (catalog.state !== "ok" || !catalog.selected) throw new Error("Missing selected course");
    const result = await read(client, catalog.selected);
    expect(result.state).toBe("ok");
    if (result.state === "ok") expect(result.course.id).toBe(2);
    expect(methods.listStudents).toHaveBeenCalledWith(2);
    expect(methods.listAssignments).toHaveBeenCalledWith(2);
    for (const call of methods.listSubmissions.mock.calls) expect(call).toEqual([2, 8]);
    expect(methods.getCourseByLtiContext).not.toHaveBeenCalled();
  });
});
