import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { reportGenerationFilter, readCourseReport, saveCourseReport, recordCourseReportNotification } from "../courseReportStore";
import { buildWeeklyReport } from "../weeklyReport";

const db = vi.hoisted(() => vi.fn(() => { throw new Error("Unexpected DB access"); }));
vi.mock("@/lib/db/client", () => ({ getDb: db }));
const report = buildWeeklyReport({ weekStart: "2026-09-07", students: [], recordsByStudent: new Map(), pendingByStudent: new Map() });

describe("course snapshot boundaries", () => {
  it("binds course, week and generation for notification updates", () => {
    const query = new PgDialect().sqlToQuery(reportGenerationFilter("course-a", "2026-09-07", "generation-a")!);
    expect(query.params).toEqual(["course-a", "2026-09-07", "generation-a"]);
    expect(query.sql).toContain('"course_weekly_reports"."course_id"');
    expect(query.sql).toContain('"course_weekly_reports"."generation_id"');
  });
  it.each(["", "   "])("rejects unscoped reads before DB access: %s", async course => {
    await expect(readCourseReport(course)).rejects.toThrow("course");
  });
  it("rejects unscoped saves before DB access", async () => {
    await expect(saveCourseReport("", report, new Date())).rejects.toThrow("course");
  });
  it("rejects updates without a generation before DB access", async () => {
    await expect(recordCourseReportNotification("course-a", report.weekStart, "", { state: "sent", recipientCount: 1 })).rejects.toThrow("generation");
  });
});
