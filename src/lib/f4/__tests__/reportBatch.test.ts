import { describe, expect, it, vi } from "vitest";
import { generateCourseReportBatch } from "../reportBatch";
import { buildWeeklyReport } from "../weeklyReport";

const result = {
  report: buildWeeklyReport({ weekStart: "2026-09-07", students: [], recordsByStudent: new Map(), pendingByStudent: new Map() }),
  generatedAt: "2026-09-11T00:00:00Z", notify: { state: "skipped" as const, reason: "Fictional" },
};
describe("course report batch", () => {
  it("processes each recorded nonblank course once", async () => {
    const generate = vi.fn(async () => result);
    const rows = await generateCourseReportBatch("2026-09-07", { courses: async () => ["course-a", "course-b", "course-a", " "], generate });
    expect(rows.map(row => row.courseId)).toEqual(["course-a", "course-b"]);
    expect(generate.mock.calls).toEqual([[{ courseId: "course-a", weekStart: "2026-09-07" }], [{ courseId: "course-b", weekStart: "2026-09-07" }]]);
  });
  it("does not generate a global report when no course is recorded", async () => {
    const generate = vi.fn(async () => result);
    expect(await generateCourseReportBatch(undefined, { courses: async () => [], generate })).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });
  it("continues after a failure without retrying or exposing exception details", async () => {
    const generate = vi.fn().mockRejectedValueOnce(new Error("fictional-private-value")).mockResolvedValueOnce(result);
    const rows = await generateCourseReportBatch(undefined, { courses: async () => ["course-a", "course-b"], generate });
    expect(rows[0]).toEqual({ courseId: "course-a", state: "failed" });
    expect(rows[1].state).toBe("generated");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(rows)).not.toContain("fictional-private-value");
  });
  it("does not generate if course enumeration fails", async () => {
    const generate = vi.fn(async () => result);
    await expect(generateCourseReportBatch(undefined, { courses: async () => { throw new Error("Unavailable"); }, generate })).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
  });
});
