import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), roster: vi.fn(), send: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.actor }));
vi.mock("@/lib/roster", () => ({ getRoster: mocks.roster }));
vi.mock("@/lib/audit/log", () => ({ recordAudit: mocks.audit }));
vi.mock("@/lib/f2/chatLog", () => ({ sendTeacherMessage: mocks.send, TeacherMessageError: class extends Error {} }));
import { POST } from "../../../../app/api/teacher/message/route";

const request = (body: unknown) => new NextRequest("http://localhost/api/teacher/message", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

describe("message route course boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ role: "teacher", userId: "t-a", viaLti: true, courseId: "course-a" });
    mocks.roster.mockResolvedValue([{ id: "s-a", displayName: "架空受講生" }]);
    mocks.send.mockResolvedValue({ id: 1, studentId: "s-a", body: "架空の連絡", sentAt: "2026-09-11T01:00:00Z" });
  });

  it("uses the verified course, ignoring a caller-supplied course", async () => {
    const response = await POST(request({ studentId: "s-a", body: "架空の連絡", courseId: "course-b" }));
    expect(response.status).toBe(200);
    expect(mocks.roster).toHaveBeenCalledWith("course-a");
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ studentId: "s-a", courseId: "course-a", sentBy: "t-a" }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ after: expect.objectContaining({ courseId: "course-a" }) }));
  });

  it("rejects an outside-course recipient before any write", async () => {
    const response = await POST(request({ studentId: "s-b", body: "架空の連絡" }));
    expect(response.status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(["student", "guest"])("rejects %s even when invoked without proxy", async (role) => {
    mocks.actor.mockResolvedValue({ role, userId: "s-a", viaLti: true, courseId: "course-a" });
    expect((await POST(request({ studentId: "s-a", body: "架空の連絡" }))).status).toBe(403);
    expect(mocks.roster).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects a verified teacher without a course before reading the roster", async () => {
    mocks.actor.mockResolvedValue({ role: "teacher", userId: "t-a", viaLti: true });
    expect((await POST(request({ studentId: "s-a", body: "架空の連絡" }))).status).toBe(403);
    expect(mocks.roster).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
