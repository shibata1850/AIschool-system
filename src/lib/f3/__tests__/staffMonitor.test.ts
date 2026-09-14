import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth";
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), getRoster: vi.fn(), findSubmission: vi.fn(), getLessonRecords: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/roster", () => ({ getRoster: mocks.getRoster }));
vi.mock("../store", () => ({ CURRENT_ASSIGNMENT_ID: "a1", findSubmission: mocks.findSubmission, getLessonRecords: mocks.getLessonRecords }));
import { getStaffMonitor } from "../staffMonitor";

const actor: CurrentUser = { userId: "staff", role: "teacher", viaLti: true, courseId: "a" };
describe("staff monitoring across courses", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getRoster.mockResolvedValue([
      { id: "shared", displayName: "Fictional shared", seatNo: 2 },
      { id: "other", displayName: "Fictional other", seatNo: 3 },
      { id: "legacy", displayName: "Fictional legacy", seatNo: 4 },
    ]);
    mocks.getDb.mockReturnValue({ select: () => ({ from: () => Promise.resolve([
      { studentId: "shared", courseId: "a" }, { studentId: "shared", courseId: "b" },
      { studentId: "other", courseId: "b" },
    ]) }) });
    mocks.findSubmission.mockImplementation(async (_assignment, _student, course) => ({ status: course === "a" ? "completed" : "submitted" }));
    mocks.getLessonRecords.mockResolvedValue([]);
  });

  it.each(["student", "guest"] as const)("rejects %s before reading data", async role => {
    await expect(getStaffMonitor({ ...actor, role })).rejects.toThrow("Forbidden");
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.getRoster).not.toHaveBeenCalled();
  });

  it("keeps one shared seat tile and separates each course's state", async () => {
    const tiles = await getStaffMonitor(actor);
    expect(tiles).toHaveLength(3);
    expect(tiles[0].student.seatNo).toBe(2);
    expect(tiles[0].states.map(state => [state.courseId, state.status])).toEqual([["a", "completed"], ["b", "submitted"]]);
    expect(tiles.map(tile => tile.canMessage)).toEqual([true, false, false]);
    expect(mocks.getRoster).toHaveBeenCalledWith();
    expect(mocks.getLessonRecords).toHaveBeenCalledWith("shared", "a");
    expect(mocks.getLessonRecords).toHaveBeenCalledWith("shared", "b");
    expect(tiles[2].states[0].courseId).toBeNull();
  });

  it("allows staff without a selected course to read but not send", async () => {
    const tiles = await getStaffMonitor({ ...actor, courseId: undefined });
    expect(tiles).toHaveLength(3);
    expect(tiles.every(tile => !tile.canMessage)).toBe(true);
  });
});
