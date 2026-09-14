import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), connect: vi.fn(), drizzle: vi.fn() }));
vi.mock("pg", () => ({ Pool: class { connect = mocks.connect; } }));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: mocks.drizzle }));
import { withWeeklyReportLock, WeeklyReportBusyError } from "../client";

describe("weekly generation and retention lock", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    globalThis.__dbPool = undefined;
    vi.stubEnv("DATABASE_URL", "postgresql://fictional.invalid/unused");
    mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
    mocks.query.mockResolvedValueOnce({ rows: [{ acquired: true }] }).mockResolvedValue({ rows: [{ released: true }] });
    mocks.drizzle.mockReturnValue({ marker: "reserved-client" });
  });
  afterEach(() => { globalThis.__dbPool = undefined; vi.unstubAllEnvs(); });
  it("uses the reserved client and releases its session lock", async () => {
    const work = vi.fn(async () => "done");
    expect(await withWeeklyReportLock(work)).toBe("done");
    expect(work).toHaveBeenCalledWith({ marker: "reserved-client" });
    expect(mocks.drizzle).toHaveBeenCalledWith(expect.objectContaining({ query: mocks.query }), expect.any(Object));
    expect(mocks.query.mock.calls[0][0]).toContain("pg_try_advisory_lock");
    expect(mocks.query.mock.calls[1][0]).toContain("pg_advisory_unlock");
    expect(mocks.query.mock.calls[0][1]).toEqual(mocks.query.mock.calls[1][1]);
    expect(mocks.release).toHaveBeenCalledExactlyOnceWith(false);
  });
  it("rejects contention without running work or unlocking someone else's lock", async () => {
    mocks.query.mockReset().mockResolvedValue({ rows: [{ acquired: false }] });
    const work = vi.fn();
    await expect(withWeeklyReportLock(work)).rejects.toBeInstanceOf(WeeklyReportBusyError);
    expect(work).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.release).toHaveBeenCalledExactlyOnceWith(false);
  });
  it("releases the lock even when work fails", async () => {
    await expect(withWeeklyReportLock(async () => { throw new Error("Fictional failure"); })).rejects.toThrow("Fictional failure");
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.release).toHaveBeenCalledExactlyOnceWith(false);
  });
  it("discards a connection if unlocking fails", async () => {
    mocks.query.mockReset().mockResolvedValueOnce({ rows: [{ acquired: true }] }).mockRejectedValueOnce(new Error("Fictional disconnect"));
    await withWeeklyReportLock(async () => undefined);
    expect(mocks.release).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("discards a connection when acquiring the lock has an uncertain result", async () => {
    mocks.query.mockReset().mockRejectedValueOnce(new Error("Fictional lost response"));
    const work = vi.fn();
    await expect(withWeeklyReportLock(work)).rejects.toThrow();
    expect(work).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledExactlyOnceWith(true);
  });
});
