import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth";
const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
import { listStaffReviewSubmissions } from "../store";

describe("staff cross-course review reads", () => {
  beforeEach(() => vi.resetAllMocks());
  it.each(["student", "guest"])("rejects %s before a database read", async role => {
    await expect(listStaffReviewSubmissions({ role, userId: "s", viaLti: true } as CurrentUser)).rejects.toThrow("Forbidden");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it.each(["teacher", "admin"])("shows pending and failed sync records across courses for %s", async role => {
    const rows = [
      { id: "a", courseId: "course-a", status: "submitted", canvasSyncError: null },
      { id: "b", courseId: "course-b", status: "ai_graded", canvasSyncError: null },
      { id: "legacy", courseId: null, status: "completed", canvasSyncError: "fictional failure" },
    ].map(row => ({ ...row, studentId: "s", assignmentId: "task", versions: [] }));
    const select = vi.fn()
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => Promise.resolve(rows) }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([{ id: "task", title: "Fictional task" }]) }) });
    mocks.getDb.mockReturnValue({ select });
    const result = await listStaffReviewSubmissions({ role, userId: "staff", viaLti: true } as CurrentUser);
    expect(result.pending.map(entry => entry.submission.id)).toEqual(["a", "b"]);
    expect(result.syncFailures.map(entry => entry.submission.id)).toEqual(["legacy"]);
    expect(result.pending[1].assignment?.title).toBe("Fictional task");
  });
});
