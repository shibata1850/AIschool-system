import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateWeeklyReport } from "../generateWeeklyReport";

const mocks = vi.hoisted(() => ({
  db: { marker: "dedicated-connection" },
  lock: vi.fn(),
  roster: vi.fn(async () => []), records: vi.fn(async () => new Map()), pending: vi.fn(async () => new Map()),
  save: vi.fn(async () => "generation-a"), record: vi.fn(async () => true),
  claim: vi.fn(async () => true), read: vi.fn(),
  notify: vi.fn(async () => ({ state: "sent" as const, recipientCount: 1 })),
}));
vi.mock("@/lib/roster", () => ({ getRoster: mocks.roster }));
vi.mock("@/lib/f3/store", () => ({ getAllLessonRecords: mocks.records, getPendingAssignmentsByStudent: mocks.pending }));
vi.mock("../courseReportStore", () => ({ saveCourseReport: mocks.save, recordCourseReportNotification: mocks.record, readCourseReport: mocks.read, claimCourseReportNotification: mocks.claim }));
vi.mock("../notifyReport", () => ({ notifyWeeklyReport: mocks.notify }));
vi.mock("@/lib/db/client", () => ({ getDb: () => { throw new Error("Legacy DB access"); }, withWeeklyReportLock: mocks.lock }));
const now = new Date("2026-09-11T00:00:00Z");
const generate = (courseId?: string) => generateWeeklyReport({ now, ...{ courseId } });

describe("course report generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lock.mockImplementation(async work => work(mocks.db));
  });
  it("rejects a missing course before reading or notifying", async () => {
    await expect(generate()).rejects.toThrow("course");
    expect(mocks.records).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("uses one course for roster, sources, persistence and notification", async () => {
    const result = await generate("course-a");
    expect(mocks.roster).toHaveBeenCalledWith("course-a", mocks.db);
    expect(mocks.records).toHaveBeenCalledWith("course-a", mocks.db);
    expect(mocks.pending).toHaveBeenCalledWith("course-a", mocks.db);
    expect(mocks.save).toHaveBeenCalledWith("course-a", result.report, now, mocks.db);
    expect(mocks.claim).toHaveBeenCalledWith("course-a", result.report.weekStart, "generation-a", mocks.db);
    expect(mocks.notify).toHaveBeenCalledWith(result.report, undefined, "course-a");
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.notify.mock.invocationCallOrder[0]);
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.claim.mock.invocationCallOrder[0]);
    expect(mocks.claim.mock.invocationCallOrder[0]).toBeLessThan(mocks.notify.mock.invocationCallOrder[0]);
    expect(mocks.record).toHaveBeenCalledWith("course-a", result.report.weekStart, "generation-a", result.notify, undefined, mocks.db);
  });
  it("does not notify when saving fails", async () => {
    mocks.save.mockRejectedValueOnce(new Error("Fictional save failure"));
    await expect(generate("course-a")).rejects.toThrow();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("selects the current Japanese week at Monday 07:00", async () => {
    const result = await generateWeeklyReport({ courseId: "course-a", now: new Date("2026-09-06T22:00:00Z") });
    expect(result.report.weekStart).toBe("2026-09-07");
  });
  it("does not send when another generation owns notification", async () => {
    mocks.claim.mockResolvedValueOnce(false);
    mocks.read.mockResolvedValueOnce({ report: { weekStart: "2026-09-07", rows: [] }, generatedAt: now.toISOString() });
    const result = await generate("course-a");
    expect(result.notify.state).toBe("skipped");
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("does not send if persisting the notification claim fails", async () => {
    mocks.claim.mockRejectedValueOnce(new Error("Fictional claim failure"));
    await expect(generate("course-a")).rejects.toThrow();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("reports failure if the notification result cannot update its generation", async () => {
    mocks.record.mockResolvedValueOnce(false);
    await expect(generate("course-a")).rejects.toThrow();
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });
  it("does not query or notify when maintenance owns the lock", async () => {
    mocks.lock.mockRejectedValueOnce(new Error("Busy"));
    await expect(generate("course-a")).rejects.toThrow("Busy");
    expect(mocks.roster).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
