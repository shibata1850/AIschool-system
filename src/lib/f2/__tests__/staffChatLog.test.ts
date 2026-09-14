import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
import { listStaffChatLogs } from "../chatLog";

describe("staff chat log reads", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(["student", "guest"])("rejects %s before accessing the database", async role => {
    await expect(listStaffChatLogs({ role, userId: "s", viaLti: true } as CurrentUser)).rejects.toThrow("Forbidden");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it.each(["teacher", "admin"])("returns multiple courses and legacy records for %s", async role => {
    const rows = ["course-a", "course-b", null].map((courseId, id) => ({
      id, courseId, studentId: "s", askedAt: new Date("2026-09-14T00:00:00Z"),
      maskedQuestion: "fictional", reply: "reply", blocked: false,
      piiDetected: false, elapsedMs: 100, model: null,
    }));
    const limit = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ orderBy: vi.fn().mockReturnValue({ limit }) });
    mocks.getDb.mockReturnValue({
      selectDistinct: () => ({ from: () => Promise.resolve([{ studentId: "s" }]) }),
      select: () => ({ from: () => ({ where }) }),
    });
    const result = await listStaffChatLogs({ role, userId: "staff", viaLti: true } as CurrentUser);
    expect(result[0].logs).toHaveLength(3);
    expect(result[0].logs[0].askedAt).toBe("2026-09-14T00:00:00.000Z");
    expect(limit).toHaveBeenCalledWith(50);
    expect(where).toHaveBeenCalledOnce();
  });
});
