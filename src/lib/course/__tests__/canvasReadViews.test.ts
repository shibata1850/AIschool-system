import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), client: vi.fn(), data: vi.fn(), summary: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.actor }));
vi.mock("@/lib/canvas/staffCatalog", () => ({ resolveStaffCatalog: async (actor: { courseId?: string }, _client: unknown, requested?: string) => {
  const courses = [{ id: 1, name: "Course A" }, { id: 2, name: "Unlaunched B" }];
  if (requested === "unknown") return { state: "error", message: "指定されたコースが一覧にありません" };
  return { state: "ok", courses, selected: courses[requested === "2" || actor.courseId === "course-b" ? 1 : 0] };
} }));
vi.mock("@/lib/canvas/client", () => ({ createCanvasClient: mocks.client }));
vi.mock("@/lib/canvas/courseData", () => ({ readCourseData: mocks.data }));
vi.mock("@/lib/canvas/classSummary", () => ({ readClassSummary: mocks.summary }));
import ClassPage from "../../../../app/teacher/class/page";
import SummaryPage from "../../../../app/teacher/summary/page";

describe.each([{ page: ClassPage, read: mocks.data }, { page: SummaryPage, read: mocks.summary }])("Canvas read page boundary (%#)", ({ page, read }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ role: "teacher", viaLti: true, userId: "fictional-teacher", courseId: "course-a" });
    mocks.client.mockReturnValue({});
    mocks.data.mockResolvedValue({ state: "notConfigured" });
    mocks.summary.mockResolvedValue({ state: "notConfigured" });
  });
  it("passes the authenticated course to the data layer", async () => {
    expect(renderToStaticMarkup(await page({}))).toContain("Canvas未接続");
    expect(read).toHaveBeenCalledWith({}, { id: 1, name: "Course A" });
  });
  it.each(["student", "guest"])("rejects %s before reading data", async role => {
    mocks.actor.mockResolvedValue({ role, viaLti: true, courseId: "course-a" });
    await expect(page({})).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("allows an LTI teacher with no course to select a recorded course", async () => {
    mocks.actor.mockResolvedValue({ role: "teacher", viaLti: true });
    await page({ searchParams: Promise.resolve({ course: "2" }) });
    expect(read).toHaveBeenCalledWith({}, { id: 2, name: "Unlaunched B" });
  });
  it("defaults administrators to their launched course", async () => {
    mocks.actor.mockResolvedValue({ role: "admin", viaLti: true, userId: "fictional-admin", courseId: "course-b" });
    await page({});
    expect(read).toHaveBeenCalledWith({}, { id: 2, name: "Unlaunched B" });
  });
  it("lets teachers select another recorded course", async () => {
    const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ course: "2" }) }));
    expect(html).toContain("Unlaunched B");
    expect(read).toHaveBeenCalledWith({}, { id: 2, name: "Unlaunched B" });
  });
  it("shows unknown selection without reading student data", async () => {
    const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ course: "unknown" }) }));
    expect(html).toContain("指定されたコースが一覧にありません");
    expect(read).not.toHaveBeenCalled();
  });
});
