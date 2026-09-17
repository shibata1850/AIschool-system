import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
import { readTrainingSettings, saveTrainingSettings } from "../trainingStore";
import { auditLog, courseTrainingDays, courseTrainingSettings } from "@/lib/db/schema";

const teacher: CurrentUser = { role: "teacher", userId: "fictional-teacher", viaLti: true, courseId: "course-a" };
const policy = { materialUrls: [], quizUrls: [] };
const input = () => ({ courseId: "course-a", mode: "btob", currentDay: 1, revision: 0,
  days: [{ day: 1, title: "授業1", materialUrl: null, quizUrl: null }] });

function database(rows: unknown[] = []) {
  const where = vi.fn().mockResolvedValue(rows);
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) });
  const tx = {
    select: vi.fn(() => ({ from: () => ({ leftJoin: () => ({ where }) }) })),
    execute: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn((_table: unknown) => ({ values })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  };
  const transaction = vi.fn(async (work: (db: typeof tx) => Promise<unknown>) => work(tx));
  mocks.getDb.mockReturnValue({ ...tx, transaction });
  return { tx, where, values, transaction };
}

beforeEach(() => vi.clearAllMocks());

describe("training storage access and transaction orchestration", () => {
  it.each(["student", "guest"] as const)("rejects writes by %s before opening the DB", async role => {
    await expect(saveTrainingSettings({ ...teacher, role }, input(), policy)).rejects.toMatchObject({ status: 403 });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("rejects writes without a verified course", async () => {
    await expect(saveTrainingSettings({ ...teacher, courseId: undefined }, input(), policy)).rejects.toMatchObject({ status: 403 });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("rejects another course in the input", async () => {
    await expect(saveTrainingSettings(teacher, { ...input(), courseId: "course-b" }, policy)).rejects.toMatchObject({ status: 400 });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("rejects revision overflow", async () => {
    await expect(saveTrainingSettings(teacher, { ...input(), revision: 2147483647 }, policy)).rejects.toMatchObject({ status: 400 });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("rejects cross-course student reads before opening the DB", async () => {
    await expect(readTrainingSettings({ ...teacher, role: "student" }, "course-b")).rejects.toMatchObject({ status: 403 });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("allows staff cross-course reads without granting cross-course writes", async () => {
    database();
    await expect(readTrainingSettings(teacher, "course-b")).resolves.toBeNull();
  });
  it("does not turn a database failure into an absent setting", async () => {
    const { where } = database();
    where.mockRejectedValue(new Error("fictional database failure"));
    await expect(readTrainingSettings(teacher, "course-a")).rejects.toThrow("fictional database failure");
  });
  it("writes settings, days and audit using the same transaction", async () => {
    const { tx, values, transaction } = database();
    await expect(saveTrainingSettings(teacher, input(), policy)).resolves.toEqual({ ...input(), revision: 1 });
    expect(transaction).toHaveBeenCalledOnce();
    expect(tx.execute).toHaveBeenCalledOnce();
    expect(tx.insert.mock.calls.map(call => call[0])).toEqual([courseTrainingSettings, courseTrainingDays, auditLog]);
    expect(values).toHaveBeenLastCalledWith(expect.objectContaining({ entity: "course_training_settings",
      action: "create", before: null, after: { ...input(), revision: 1 } }));
  });
  it("stops a stale revision before any writes", async () => {
    const { tx } = database([{ settings: { ...input(), revision: 2 }, day: null }]);
    await expect(saveTrainingSettings(teacher, input(), policy)).rejects.toMatchObject({ status: 409 });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });
});
