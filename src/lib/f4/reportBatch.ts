import { listRecordedCourseIds } from "@/lib/roster";
import { generateWeeklyReport, type GenerateResult } from "./generateWeeklyReport";
import { isReportWeek } from "./reportWeek";

export type CourseBatchResult =
  | { courseId: string; state: "generated"; result: GenerateResult }
  | { courseId: string; state: "failed" };

export async function generateCourseReportBatch(
  weekStart?: string,
  dependencies = { courses: listRecordedCourseIds, generate: generateWeeklyReport },
): Promise<CourseBatchResult[]> {
  if (weekStart !== undefined && !isReportWeek(weekStart)) throw new Error("Report week must be a valid Monday");
  const courseIds = [...new Set(await dependencies.courses())].filter(id => id.trim());
  const results: CourseBatchResult[] = [];
  for (const courseId of courseIds) {
    try {
      const result = await dependencies.generate({ courseId, weekStart });
      results.push({ courseId, state: "generated", result });
    } catch {
      // Delivery may have succeeded before a later failure; never retry blindly.
      results.push({ courseId, state: "failed" });
    }
  }
  return results;
}
