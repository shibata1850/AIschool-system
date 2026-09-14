import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), options: vi.fn(), links: vi.fn(), client: vi.fn(), course: vi.fn(), assignments: vi.fn(), form: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.actor }));
vi.mock("@/lib/f3/allocation", () => ({ listAllocationOptions: mocks.options }));
vi.mock("@/lib/canvas/assignmentLinks", () => ({ listCanvasAssignmentLinks: mocks.links }));
vi.mock("@/lib/canvas/client", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/canvas/client")>(), createCanvasClient: mocks.client }));
vi.mock("../../../../app/teacher/assignment-links/link-form", () => ({ AssignmentLinkForm: mocks.form }));
import Page from "../../../../app/teacher/assignment-links/page";

describe("assignment link registration view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ role: "teacher", userId: "t-a", viaLti: true, courseId: "course-a" });
    mocks.options.mockResolvedValue({ exercises: [{ id: "a1", title: "Exercise A" }, { id: "a2", title: "Exercise B" }] });
    mocks.links.mockResolvedValue([{ assignmentId: "a1", canvasAssignmentId: 900 }]);
    mocks.client.mockReturnValue({ getCourseByLtiContext: mocks.course, listAssignments: mocks.assignments });
    mocks.course.mockResolvedValue({ id: 7 });
    mocks.assignments.mockResolvedValue([
      { id: 900, name: "Registered target", published: true, points_possible: 100 },
      { id: 901, name: "Available target", published: true, points_possible: 100 },
      { id: 902, name: "Draft", published: false, points_possible: 100 },
      { id: 903, name: "Ten points", published: true, points_possible: 10 },
    ]);
    mocks.form.mockReturnValue(null);
  });
  it("shows existing links but only offers unused 100-point published targets", async () => {
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Registered target");
    expect(mocks.options).toHaveBeenCalledWith("course-a");
    expect(mocks.links).toHaveBeenCalledWith("course-a");
    expect(mocks.course).toHaveBeenCalledWith("course-a");
    expect(mocks.assignments).toHaveBeenCalledWith(7);
    expect(mocks.form.mock.calls[0][0]).toEqual({ exercises: [{ id: "a2", title: "Exercise B" }], targets: [{ id: 901, name: "Available target" }] });
  });
  it.each(["student", "guest"])("rejects %s without reading data", async role => {
    mocks.actor.mockResolvedValue({ role, viaLti: true, courseId: "course-a" });
    await expect(Page()).rejects.toThrow();
    expect(mocks.options).not.toHaveBeenCalled();
    expect(mocks.links).not.toHaveBeenCalled();
  });
  it("hides the form when Canvas is unavailable, retaining existing link IDs", async () => {
    mocks.client.mockReturnValue(null);
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Canvasに接続していません");
    expect(html).toContain("Canvas課題 ID 900");
    expect(mocks.form).not.toHaveBeenCalled();
  });
  it("does not offer registration after all exercises are linked", async () => {
    mocks.links.mockResolvedValue([{ assignmentId: "a1", canvasAssignmentId: 900 }, { assignmentId: "a2", canvasAssignmentId: 901 }]);
    expect(renderToStaticMarkup(await Page())).toContain("未登録の演習はありません");
    expect(mocks.form).not.toHaveBeenCalled();
  });
});
