import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), roster: vi.fn(), records: vi.fn(), mastery: vi.fn(), snapshot: vi.fn(), unscheduled: vi.fn() }));
vi.mock("@/lib/course/learningRecords", () => ({ countUnscheduledAssignments: mocks.unscheduled }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.actor }));
vi.mock("@/lib/roster", () => ({ getRoster: mocks.roster, listRecordedCourseIds: async () => ["course-a", "course-b"] }));
vi.mock("@/lib/f3/store", () => ({ getLessonRecords: mocks.records }));
vi.mock("@/lib/integration/mastery", () => ({ getExternalMasteryForStudent: mocks.mastery }));
vi.mock("@/lib/f4/generateWeeklyReport", () => ({ getLatestWeeklyReport: mocks.snapshot }));
import Page from "../../../../app/teacher/report/page";

describe("weekly report view scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.unscheduled.mockResolvedValue(0);
    mocks.actor.mockResolvedValue({ role: "teacher", viaLti: true, userId: "teacher-a", courseId: "course-a" });
    mocks.roster.mockResolvedValue([{ id: "student-a", displayName: "Fictional A", seatNo: 1 }]);
    mocks.records.mockResolvedValue([]); mocks.mastery.mockResolvedValue([]); mocks.snapshot.mockResolvedValue(null);
  });
  it("does not include a future-only student in current achievement rows", async () => {
    mocks.records.mockResolvedValue([{ lessonId: "future", weekStart: "2099-01-05", source: "assignment",
      submitted: false, attended: false, score: null }]);
    expect(renderToStaticMarkup(await Page({}))).not.toContain("Fictional A");
  });
  it("shows unscheduled assignments separately without inventing achievement", async () => {
    mocks.unscheduled.mockResolvedValue(2);
    const html = renderToStaticMarkup(await Page({}));
    expect(html).toContain("対象週未設定の課題");
    expect(html).toContain("Fictional A: 2件");
    expect(mocks.unscheduled).toHaveBeenCalledWith("course-a", "student-a");
  });
  it("uses the session course for every data source", async () => {
    expect(renderToStaticMarkup(await Page({}))).toContain("週次到達度レポート");
    expect(mocks.roster).toHaveBeenCalledWith("course-a");
    expect(mocks.snapshot).toHaveBeenCalledWith("course-a");
    expect(mocks.records).toHaveBeenCalledWith("student-a", "course-a");
    expect(mocks.mastery).toHaveBeenCalledWith("student-a", "course-a");
  });
  it.each(["student", "guest"])("rejects %s before querying", async role => {
    mocks.actor.mockResolvedValue({ role, viaLti: true, courseId: "course-a" });
    await expect(Page({})).rejects.toThrow();
    expect(mocks.roster).not.toHaveBeenCalled();
  });
  it("allows an LTI teacher with no course to browse a recorded course", async () => {
    mocks.actor.mockResolvedValue({ role: "teacher", viaLti: true });
    await Page({ searchParams: Promise.resolve({ course: "course-b" }) });
    expect(mocks.snapshot).toHaveBeenCalledWith("course-b");
    expect(mocks.records).toHaveBeenCalledWith("student-a", "course-b");
  });
  it("defaults administrators to their launched course", async () => {
    mocks.actor.mockResolvedValue({ role: "admin", viaLti: true, courseId: "course-b" });
    await Page({});
    expect(mocks.roster).toHaveBeenCalledWith("course-b");
  });
  it("uses the selected other course consistently for all report sources", async () => {
    await Page({ searchParams: Promise.resolve({ course: "course-b" }) });
    expect(mocks.roster).toHaveBeenCalledWith("course-b");
    expect(mocks.snapshot).toHaveBeenCalledWith("course-b");
    expect(mocks.records).toHaveBeenCalledWith("student-a", "course-b");
    expect(mocks.mastery).toHaveBeenCalledWith("student-a", "course-b");
  });
});
