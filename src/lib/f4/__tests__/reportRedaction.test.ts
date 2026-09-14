import { describe, expect, it } from "vitest";
import { buildWeeklyReport, redactReportStudent, type WeeklyReportInput } from "../weeklyReport";

function input(): WeeklyReportInput {
  return {
    weekStart: "2026-09-07",
    students: [
      { id: "removed", displayName: "Fictional Removed", seatNo: 1 },
      { id: "retained", displayName: "Fictional Retained", seatNo: 2 },
    ],
    recordsByStudent: new Map(["removed", "retained"].map((id, studentIndex) => [id,
      ["2026-08-24", "2026-08-31", "2026-09-07"].map((weekStart, index) => ({
        lessonId: `${id}-${index}`, weekStart, attended: true, submitted: true,
        score: studentIndex === 0 ? 90 - index * 30 : 60 + index * 10,
      })),
    ])),
    pendingByStudent: new Map([["removed", ["Fictional pending work"]]]),
  };
}

describe("weekly report student redaction", () => {
  it("rebuilds rows, averages, alerts and pending counts without the removed student", () => {
    const source = input();
    const original = buildWeeklyReport(source);
    expect(original.alerts.map(row => row.studentId)).toContain("removed");
    const result = redactReportStudent(original, "removed");
    expect(result).toEqual(buildWeeklyReport({ ...source, students: source.students.filter(row => row.id !== "removed") }));
    expect(JSON.stringify(result)).not.toContain("Fictional Removed");
    expect(JSON.stringify(result)).not.toContain("Fictional pending work");
    expect(original.rows).toHaveLength(2);
  });
  it("retains the week and null averages after removing every student", () => {
    const source = input();
    const report = buildWeeklyReport({ ...source, students: source.students.slice(0, 1) });
    const result = redactReportStudent(report, "removed");
    expect(result.weekStart).toBe(source.weekStart);
    expect(result.rows).toEqual([]);
    expect(result.alerts).toEqual([]);
    expect(result.summary).toMatchObject({ studentCount: 0, averageAchievement: null, averageAttendanceRate: null, averageSubmissionRate: null });
  });
  it("is idempotent", () => {
    const once = redactReportStudent(buildWeeklyReport(input()), "removed");
    expect(redactReportStudent(once, "removed")).toEqual(once);
  });
  it("rejects an empty identifier", () => {
    expect(() => redactReportStudent(buildWeeklyReport(input()), " ")).toThrow();
  });
});
