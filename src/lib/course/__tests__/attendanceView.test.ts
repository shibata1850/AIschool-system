import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), roster: vi.fn(), attendance: vi.fn(), courses: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.actor }));
vi.mock("@/lib/roster", () => ({ getRoster: mocks.roster, listRecordedCourseIds: mocks.courses }));
vi.mock("@/lib/f3/store", () => ({ getAttendance: mocks.attendance }));
vi.mock("../../../../app/teacher/attendance/attendance-row", () => ({ AttendanceRow: () => "ATTENDANCE_EDITOR" }));
import Page from "../../../../app/teacher/attendance/page";

describe("staff attendance view", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-17T03:00:00Z"));
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ role: "teacher", userId: "staff", viaLti: true, courseId: "a" });
    mocks.courses.mockResolvedValue(["a", "b"]);
    mocks.roster.mockResolvedValue([{ id: "fictional", displayName: "Fictional student", seatNo: 2 }]);
    mocks.attendance.mockResolvedValue(true);
  });
  afterEach(() => vi.useRealTimers());
  it("retains editing for the launch course", async () => {
    expect(renderToStaticMarkup(await Page({}))).toContain("ATTENDANCE_EDITOR");
    expect(mocks.attendance).toHaveBeenCalledWith("fictional", "2026-09-14", "a");
  });
  it("reads the selected other course without an attendance editor", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ course: "b" }) }));
    expect(html).toContain("Fictional student");
    expect(html).toContain("閲覧のみ（起動元コース外の記録）");
    expect(html).not.toContain("ATTENDANCE_EDITOR");
    expect(mocks.roster).toHaveBeenCalledWith("b");
    expect(mocks.attendance).toHaveBeenCalledWith("fictional", "2026-09-14", "b");
  });
  it("rejects unknown course before reading student records", async () => {
    await expect(Page({ searchParams: Promise.resolve({ course: "unknown" }) })).rejects.toThrow();
    expect(mocks.roster).not.toHaveBeenCalled();
    expect(mocks.attendance).not.toHaveBeenCalled();
  });
  it("reads attendance for the new week when the date advances", async () => {
    vi.setSystemTime(new Date("2026-09-23T03:00:00Z"));
    await Page({});
    expect(mocks.attendance).toHaveBeenCalledWith("fictional", "2026-09-21", "a");
  });
  it.each(["student", "guest"])("rejects %s before listing courses", async role => {
    mocks.actor.mockResolvedValue({ role, viaLti: true, courseId: "a" });
    await expect(Page({})).rejects.toThrow();
    expect(mocks.courses).not.toHaveBeenCalled();
  });
});
