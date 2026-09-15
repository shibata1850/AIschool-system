import { describe, expect, it } from "vitest";
import { computeWeeklyAchievements, type LessonRecord } from "../achievement";

const assignment = (score: number | null, submitted = true): LessonRecord => ({
  lessonId: `assignment-${score}`, weekStart: "2026-09-14", attended: false,
  submitted, score, source: "assignment",
});
const attendance = (attended: boolean): LessonRecord => ({
  lessonId: "attendance", weekStart: "2026-09-14", attended, submitted: false,
  score: null, source: "attendance",
});

describe("independent assignment and attendance denominators", () => {
  it("keeps a grade visible without inventing an absence", () => {
    expect(computeWeeklyAchievements([assignment(80)])[0]).toMatchObject({
      attendanceRate: null, submissionRate: 100, averageScore: 80, total: 85,
    });
  });
  it("does not erase grades when attendance is recorded afterwards", () => {
    expect(computeWeeklyAchievements([assignment(80), attendance(true)])[0]).toMatchObject({
      attendanceRate: 100, submissionRate: 100, averageScore: 80, total: 88,
    });
  });
  it("averages assignments without multiplying the attendance denominator", () => {
    expect(computeWeeklyAchievements([assignment(60), assignment(100), assignment(null, false), attendance(true)])[0])
      .toMatchObject({ attendanceRate: 100, submissionRate: 66.7, averageScore: 80, total: 81.3 });
  });
  it("does not invent an unsubmitted assignment for an attendance-only week", () => {
    expect(computeWeeklyAchievements([attendance(true)])[0])
      .toMatchObject({ attendanceRate: 100, submissionRate: null, averageScore: null, total: 100 });
  });
  it("keeps zero scores and separates assignment weeks", () => {
    const result = computeWeeklyAchievements([assignment(0), { ...assignment(100), weekStart: "2026-09-21" }]);
    expect(result.map(row => row.averageScore)).toEqual([0, 100]);
  });
});
