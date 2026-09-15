import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn(), limit: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.db }));
import { recordCourseCompletionScore } from "../lessonRecords";

// Regression targets for the pending F3/F4 repair. No production database is used.
describe("completion records must not silently lose or misattribute grades", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const query = {
      from: () => query, where: () => query, orderBy: () => query,
      limit: mocks.limit,
    };
    mocks.update.mockReturnValue({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) });
    mocks.db.mockReturnValue({ select: () => query, update: mocks.update });
  });

  it("requires an explicit unresolved result when there is no attendance record", async () => {
    mocks.limit.mockResolvedValue([]);
    const outcome = await recordCourseCompletionScore("fictional-course", "fictional-student", 85);
    // A no-op reported as success prevents callers from displaying or repairing the gap.
    expect(outcome).toBeDefined();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not overwrite the latest attendance week without knowing the assignment week", async () => {
    mocks.limit.mockResolvedValue([{ weekStart: "2026-09-21" }]);
    await recordCourseCompletionScore("fictional-course", "fictional-student", 85);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
