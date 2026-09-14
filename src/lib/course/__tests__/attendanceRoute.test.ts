import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), roster: vi.fn(), set: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.actor }));
vi.mock("@/lib/roster", () => ({ getRoster: mocks.roster }));
vi.mock("@/lib/audit/log", () => ({ recordAudit: mocks.audit }));
vi.mock("@/lib/f3/store", () => ({ CURRENT_LESSON_WEEK: "2026-10-19", setAttendance: mocks.set }));
import { POST } from "../../../../app/api/teacher/attendance/route";
const request = (body: unknown) => new NextRequest("http://localhost/api/teacher/attendance", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

describe("attendance course boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ role: "teacher", userId: "t-a", viaLti: true, courseId: "course-a" });
    mocks.roster.mockResolvedValue([{ id: "s-a" }]);
    mocks.set.mockResolvedValue({ before: "none", changed: true });
  });

  it("uses the verified course for a permitted attendance change", async () => {
    const response = await POST(request({ studentId: "s-a", attended: true, courseId: "course-b" }));
    expect(response.status).toBe(200);
    expect(mocks.roster).toHaveBeenCalledWith("course-a");
    expect(mocks.set).toHaveBeenCalledWith("s-a", "2026-10-19", true, "course-a");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ after: { attended: true, courseId: "course-a" } }));
  });

  it("rejects another course's student before writing", async () => {
    expect((await POST(request({ studentId: "s-b", attended: true }))).status).toBe(403);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(["student", "guest"])("rejects the %s role without relying on proxy", async (role) => {
    mocks.actor.mockResolvedValue({ role, userId: "s-a", viaLti: true, courseId: "course-a" });
    expect((await POST(request({ studentId: "s-a", attended: true }))).status).toBe(403);
    expect(mocks.roster).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("rejects a verified teacher without course context", async () => {
    mocks.actor.mockResolvedValue({ role: "teacher", userId: "t-a", viaLti: true });
    expect((await POST(request({ studentId: "s-a", attended: true }))).status).toBe(403);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean attendance without writing", async () => {
    expect((await POST(request({ studentId: "s-a", attended: "true" }))).status).toBe(400);
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
