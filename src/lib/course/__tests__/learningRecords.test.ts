import { describe, expect, it } from "vitest";
import { buildCourseLearningRecords } from "../learningRecords";
import { computeWeeklyAchievements } from "@/lib/f4/achievement";

const graded = {
  id: "fictional-assignment", studentId: "fictional-student", targetWeek: "2026-09-14",
  status: "completed", submittedAt: "2026-10-01T00:00:00Z", teacherScore: 80,
};
const attendance = {
  studentId: graded.studentId, weekStart: "2026-09-14", lessonId: "attendance",
  attended: true, dataMissing: false,
};

describe("course learning records", () => {
  it("attributes a late submission to its assigned week without inventing attendance", () => {
    const rows = buildCourseLearningRecords([], [graded]).get(graded.studentId)!;
    expect(computeWeeklyAchievements(rows)[0]).toMatchObject({
      weekStart: "2026-09-14", averageScore: 80, attendanceRate: null, submissionRate: 100,
    });
  });
  it("preserves the grade when attendance is added later", () => {
    const rows = buildCourseLearningRecords([attendance], [graded]).get(graded.studentId)!;
    expect(computeWeeklyAchievements(rows)[0]).toMatchObject({ averageScore: 80, attendanceRate: 100 });
  });
  it("does not infer missing or invalid teaching weeks from submittedAt", () => {
    expect(buildCourseLearningRecords([], [
      { ...graded, targetWeek: null }, { ...graded, targetWeek: "2026-09-15" },
    ]).size).toBe(0);
  });
  it("does not count an unconfirmed score and includes unsubmitted allocations", () => {
    const rows = buildCourseLearningRecords([], [
      { ...graded, status: "submitted" },
      { ...graded, id: "unsubmitted", status: "not_started", submittedAt: null, teacherScore: null },
    ]).get(graded.studentId)!;
    expect(computeWeeklyAchievements(rows)[0]).toMatchObject({ averageScore: null, submissionRate: 50 });
  });
  it("keeps students separate and retains a confirmed zero score", () => {
    const records = buildCourseLearningRecords([], [graded, { ...graded, studentId: "other", teacherScore: 0 }]);
    expect(computeWeeklyAchievements(records.get("other")!)[0].averageScore).toBe(0);
    expect(computeWeeklyAchievements(records.get(graded.studentId)!)[0].averageScore).toBe(80);
  });
});
