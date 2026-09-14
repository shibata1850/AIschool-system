import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), client: vi.fn(), grade: vi.fn(),
  resolve: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.actor }));
vi.mock("@/lib/canvas/client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/canvas/client")>(), createCanvasClient: mocks.client,
}));
vi.mock("@/lib/canvas/gradebook", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/canvas/gradebook")>(),
  resolveGradebook: mocks.resolve, resolveScopedGradebook: mocks.resolve,
}));
vi.mock("@/lib/audit/log", () => ({ recordAudit: mocks.audit }));
import { POST } from "../../../../app/api/teacher/grade/route";

const request = (body: unknown) => new NextRequest("http://localhost/api/teacher/grade", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const body = { userId: 501, assignmentId: 900, score: 90 };

describe("Canvas grade course boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ role: "teacher", userId: "t-a", viaLti: true, courseId: "course-a" });
    mocks.client.mockReturnValue({ gradeSubmission: mocks.grade });
    mocks.grade.mockResolvedValue({ score: 90 });
    mocks.resolve.mockResolvedValue({ state: "ok", course: { id: 7 }, assignment: { id: 900 },
      rows: [{ student: { id: 501 }, score: null }] });
  });

  it.each(["student", "guest"])("rejects %s before Canvas access", async (role) => {
    mocks.actor.mockResolvedValue({ role, viaLti: true, courseId: "course-a" });
    expect((await POST(request(body))).status).toBe(403);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.grade).not.toHaveBeenCalled();
  });

  it("rejects a teacher with no verified course", async () => {
    mocks.actor.mockResolvedValue({ role: "teacher", viaLti: true });
    expect((await POST(request(body))).status).toBe(403);
    expect(mocks.grade).not.toHaveBeenCalled();
  });

  it("uses the session course, never a submitted course", async () => {
    expect((await POST(request({ ...body, courseId: "course-b" }))).status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(), "course-a", 900);
    expect(mocks.grade).toHaveBeenCalledWith(7, 900, 501, 90, undefined);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ after: { score: 90, courseId: "course-a" } }));
  });

  it.each([undefined, 0, -1, 1.5, "900"])("rejects invalid assignment %s without a write", async (assignmentId) => {
    expect((await POST(request({ ...body, assignmentId }))).status).toBe(400);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.grade).not.toHaveBeenCalled();
  });

  it("rejects a student absent from the scoped Canvas roster", async () => {
    expect((await POST(request({ ...body, userId: 999 }))).status).toBe(403);
    expect(mocks.grade).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("does not write when the assignment is outside the course", async () => {
    mocks.resolve.mockResolvedValue({ state: "noAssignment" });
    expect((await POST(request(body))).status).toBe(409);
    expect(mocks.grade).not.toHaveBeenCalled();
  });

  it("retains score validation", async () => {
    expect((await POST(request({ ...body, score: 101 }))).status).toBe(400);
    expect(mocks.grade).not.toHaveBeenCalled();
  });
});
