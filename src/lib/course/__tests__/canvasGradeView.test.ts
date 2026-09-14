import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), client: vi.fn(), course: vi.fn(),
  assignments: vi.fn(), gradebook: vi.fn(), form: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.actor }));
vi.mock("@/lib/canvas/client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/canvas/client")>(), createCanvasClient: mocks.client,
}));
vi.mock("@/lib/canvas/gradebook", () => ({ resolveScopedGradebook: mocks.gradebook }));
vi.mock("../../../../app/teacher/grade/grade-form", () => ({ GradeForm: mocks.form }));
import GradePage from "../../../../app/teacher/grade/page";

const page = async (assignmentId?: string | string[]) => renderToStaticMarkup(await GradePage({
  searchParams: Promise.resolve({ assignmentId }),
}));

describe("Canvas grade assignment selection and course boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ role: "teacher", userId: "t-a", viaLti: true, courseId: "course-a" });
    mocks.client.mockReturnValue({ getCourseByLtiContext: mocks.course, listAssignments: mocks.assignments });
    mocks.course.mockResolvedValue({ id: 7, name: "Course A" });
    mocks.assignments.mockResolvedValue([
      { id: 800, name: "Assignment A", published: true },
      { id: 900, name: "Assignment B", published: true },
      { id: 901, name: "Hidden draft", published: false },
    ]);
    mocks.gradebook.mockResolvedValue({ state: "ok", course: { id: 7, name: "Course A" },
      assignment: { id: 900, title: "Assignment B" }, rows: [{ student: { id: 501, name: "Test student" }, score: 0 }] });
    mocks.form.mockReturnValue(null);
  });

  it("requires an explicit selection before reading grades", async () => {
    const html = await page();
    expect(html).toContain("Assignment A");
    expect(html).toContain("Assignment B");
    expect(html).not.toContain("Hidden draft");
    expect(mocks.course).toHaveBeenCalledWith("course-a");
    expect(mocks.assignments).toHaveBeenCalledWith(7);
    expect(mocks.gradebook).not.toHaveBeenCalled();
    expect(mocks.form).not.toHaveBeenCalled();
  });

  it("passes the chosen assignment to every grade form", async () => {
    await page("900");
    expect(mocks.gradebook).toHaveBeenCalledWith(expect.anything(), "course-a", 900);
    expect(mocks.form.mock.calls[0][0]).toEqual(expect.objectContaining({ assignmentId: 900, userId: 501, initialScore: 0 }));
  });

  it.each(["999", "901", "0", "900x", ["800", "900"]])("rejects unavailable or ambiguous selection %s", async (selection) => {
    expect(await page(selection)).toContain("このコースの公開中の課題を選択してください");
    expect(mocks.gradebook).not.toHaveBeenCalled();
    expect(mocks.form).not.toHaveBeenCalled();
  });

  it("rejects a teacher without a course before accessing Canvas", async () => {
    mocks.actor.mockResolvedValue({ role: "teacher", viaLti: true });
    await expect(page()).rejects.toThrow();
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("retains the isolated demo's not-configured screen without querying Canvas", async () => {
    mocks.actor.mockResolvedValue({ role: "teacher", viaLti: false });
    mocks.client.mockReturnValue(null);
    expect(await page()).toContain("Canvas未接続");
    expect(mocks.course).not.toHaveBeenCalled();
  });
});
