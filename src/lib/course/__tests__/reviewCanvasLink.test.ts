import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), get: vi.fn(), update: vi.fn(), completion: vi.fn(),
  link: vi.fn(), sync: vi.fn(), recordSync: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.actor }));
vi.mock("@/lib/f3/store", () => ({ getSubmissionById: mocks.get, updateSubmissionIfVersion: mocks.update,
  recordCompletionScore: mocks.completion, recordCanvasSync: mocks.recordSync }));
vi.mock("@/lib/canvas/assignmentLinks", () => ({ getCanvasAssignmentLink: mocks.link }));
vi.mock("@/lib/canvas/syncGrade", () => ({ syncGradeToCanvas: mocks.sync }));
vi.mock("@/lib/audit/log", () => ({ recordAudit: mocks.audit }));
import { POST } from "../../../../app/api/submissions/[id]/review/route";

const request = (body: unknown) => new NextRequest("http://localhost/api/submissions/fictional-sub/review", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const params = { params: Promise.resolve({ id: "fictional-sub" }) };

describe("review uses the stored course-specific Canvas link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ role: "teacher", userId: "t-a", viaLti: true, courseId: "course-a" });
    mocks.get.mockResolvedValue({ id: "fictional-sub", courseId: "course-a", assignmentId: "a1", studentId: "s-a",
      canvasUserId: 501, status: "submitted", version: 1, hasDeviation: false });
    mocks.update.mockImplementation(async next => next);
    mocks.link.mockResolvedValue({ canvasAssignmentId: 900 });
    mocks.sync.mockResolvedValue({ state: "synced" });
  });

  it("ignores a forged course or Canvas assignment in the review body", async () => {
    const response = await POST(request({ action: "complete", score: 90, courseId: "course-b", canvasAssignmentId: 999 }), params);
    expect(response.status).toBe(200);
    expect(mocks.get).toHaveBeenCalledWith("fictional-sub", "course-a");
    expect(mocks.link).toHaveBeenCalledWith("course-a", "a1");
    expect(mocks.sync).toHaveBeenCalledWith(expect.objectContaining({ courseId: "course-a", canvasAssignmentId: 900, score: 90 }));
    expect(mocks.completion).toHaveBeenCalledWith("s-a", 90, "course-a");
    expect(mocks.recordSync).toHaveBeenCalledWith("fictional-sub", { syncedAt: expect.any(Date) }, "course-a");
  });

  it("retains local completion and reports a missing mapping instead of guessing", async () => {
    mocks.link.mockResolvedValue(undefined);
    mocks.sync.mockResolvedValue({ state: "skipped", reason: "Mapping not configured" });
    const response = await POST(request({ action: "complete", score: 90 }), params);
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "completed", teacherScore: 90 }), 1, "submitted");
    expect(mocks.sync).toHaveBeenCalledWith(expect.objectContaining({ courseId: "course-a", canvasAssignmentId: undefined }));
    expect(mocks.recordSync).toHaveBeenCalledWith("fictional-sub", { error: "Mapping not configured" }, "course-a");
  });

  it("does not access mapping or send grades for an unavailable submission", async () => {
    mocks.get.mockResolvedValue(undefined);
    expect((await POST(request({ action: "complete", score: 90 }), params)).status).toBe(404);
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("does not send a grade after an optimistic locking conflict", async () => {
    mocks.update.mockResolvedValue(undefined);
    expect((await POST(request({ action: "complete", score: 90 }), params)).status).toBe(409);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("does not look up a grade target when returning a submission", async () => {
    expect((await POST(request({ action: "return", comment: "Fictional revision" }), params)).status).toBe(200);
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("rejects a null body without changing the submission", async () => {
    expect((await POST(request(null), params)).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
