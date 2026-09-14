import { beforeEach, describe, expect, it } from "vitest";
import { getAdminDb } from "@/lib/db/adminClient";
import { withWeeklyReportLock, WeeklyReportBusyError } from "@/lib/db/client";
import { weeklyReports } from "@/lib/db/schema";
import { resetStore, purgeStudentData, findSubmission } from "@/lib/f3/store";
import { saveCourseReport, readCourseReport, recordCourseReportNotification, claimCourseReportNotification } from "../courseReportStore";
import { buildWeeklyReport } from "../weeklyReport";

const now = new Date("2026-09-11T00:00:00Z");
const report = (weekStart = "2026-09-07") => buildWeeklyReport({
  weekStart, students: [], recordsByStudent: new Map(), pendingByStudent: new Map(),
});

describe("course weekly snapshot persistence", () => {
  beforeEach(async () => { await resetStore(); });
  it("keeps separate generations for the same week in two courses", async () => {
    const a = await saveCourseReport("course-a", report(), now);
    const b = await saveCourseReport("course-b", report(), now);
    expect(a).not.toBe(b);
    expect((await readCourseReport("course-a"))?.generationId).toBe(a);
    expect((await readCourseReport("course-b"))?.generationId).toBe(b);
    expect(await readCourseReport("course-empty")).toBeNull();
  });
  it("does not overwrite a newer generation with an older notification result", async () => {
    const old = await saveCourseReport("course-a", report(), now);
    const current = await saveCourseReport("course-a", report(), now);
    expect(await recordCourseReportNotification("course-a", "2026-09-07", old, { state: "sent", recipientCount: 1 })).toBe(false);
    expect((await readCourseReport("course-a"))?.notifiedAt).toBeNull();
    expect(await recordCourseReportNotification("course-b", "2026-09-07", current, { state: "sent", recipientCount: 1 })).toBe(false);
    expect(await claimCourseReportNotification("course-a", "2026-09-07", current)).toBe(true);
    expect(await recordCourseReportNotification("course-a", "2026-09-07", current, { state: "sent", recipientCount: 1 }, now)).toBe(true);
    expect((await readCourseReport("course-a"))?.notifiedAt).toBe(now.toISOString());
  });
  it("selects the latest snapshot only within the requested course", async () => {
    await saveCourseReport("course-a", report("2026-08-31"), now);
    await saveCourseReport("course-b", report("2026-09-07"), now);
    expect((await readCourseReport("course-a"))?.report.weekStart).toBe("2026-08-31");
    expect(await readCourseReport("course-a", "2026-09-07")).toBeNull();
  });
  it("preserves legacy snapshots without using them as a fallback", async () => {
    await getAdminDb().insert(weeklyReports).values({ weekStart: "2026-09-07", generatedAt: now, payload: report() });
    expect(await readCourseReport("course-a")).toBeNull();
    await saveCourseReport("course-a", report(), now);
    expect(await getAdminDb().select().from(weeklyReports)).toHaveLength(1);
  });
  it("allows only one notification claim among 16 simultaneous generations", async () => {
    const results = await Promise.all(Array.from({ length: 16 }, async () => {
      const generationId = await saveCourseReport("course-a", report(), now);
      return claimCourseReportNotification("course-a", "2026-09-07", generationId);
    }));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await readCourseReport("course-a"))?.notificationClaimedAt).not.toBeNull();
  });
  it("preserves the claimed snapshot and never reclaims after an uncertain delivery", async () => {
    const original = await saveCourseReport("course-a", report(), now);
    expect(await claimCourseReportNotification("course-a", "2026-09-07", original)).toBe(true);
    const later = await saveCourseReport("course-a", report(), new Date("2026-09-12T00:00:00Z"));
    expect(await claimCourseReportNotification("course-a", "2026-09-07", later)).toBe(false);
    expect(await claimCourseReportNotification("course-a", "2026-09-07", original)).toBe(false);
    expect((await readCourseReport("course-a"))?.generationId).toBe(original);
    expect((await readCourseReport("course-a"))?.generatedAt).toBe(now.toISOString());
  });
  it("does not release the claim after a recorded failure", async () => {
    const generationId = await saveCourseReport("course-a", report(), now);
    await claimCourseReportNotification("course-a", "2026-09-07", generationId);
    expect(await recordCourseReportNotification("course-a", "2026-09-07", generationId, { state: "error", reason: "Fictional delivery uncertainty" })).toBe(true);
    expect(await claimCourseReportNotification("course-a", "2026-09-07", generationId)).toBe(false);
    const other = await saveCourseReport("course-b", report(), now);
    expect(await claimCourseReportNotification("course-b", "2026-09-07", other)).toBe(true);
  });
  it("redacts both snapshot tables without removing another student or the notification claim", async () => {
    const payload = buildWeeklyReport({
      weekStart: "2026-09-07",
      students: ["removed", "retained"].map((id, index) => ({ id, displayName: `Fictional ${id}`, seatNo: index + 1 })),
      recordsByStudent: new Map(["removed", "retained"].map(id => [id, [{ lessonId: "fictional", weekStart: "2026-09-07", attended: true, submitted: true, score: 80 }]])),
      pendingByStudent: new Map(),
    });
    await getAdminDb().insert(weeklyReports).values({ weekStart: payload.weekStart, generatedAt: now, payload });
    const generationId = await saveCourseReport("course-a", payload, now);
    await claimCourseReportNotification("course-a", payload.weekStart, generationId);
    await purgeStudentData("removed");
    const scoped = await readCourseReport("course-a");
    expect(scoped?.report.rows.map(row => row.studentId)).toEqual(["retained"]);
    expect(scoped?.report.summary.studentCount).toBe(1);
    expect(scoped?.generationId).toBe(generationId);
    expect(scoped?.notificationClaimedAt).not.toBeNull();
    expect(await claimCourseReportNotification("course-a", payload.weekStart, generationId)).toBe(false);
    const [legacy] = await getAdminDb().select().from(weeklyReports);
    expect(JSON.stringify(legacy.payload)).not.toContain("removed");
    expect(JSON.stringify(legacy.payload)).toContain("retained");
  });
  it("rolls back individual deletions if a malformed snapshot cannot be redacted", async () => {
    await getAdminDb().insert(weeklyReports).values({
      weekStart: "2026-09-07", generatedAt: now,
      payload: { rows: [{ studentId: "student-demo" }, { studentId: "malformed-other" }] },
    });
    expect(await findSubmission("a1", "student-demo")).toBeDefined();
    await expect(purgeStudentData("student-demo")).rejects.toThrow();
    expect(await findSubmission("a1", "student-demo")).toBeDefined();
  });
  it("does not delete while the report generation connection owns the lock", async () => {
    await withWeeklyReportLock(async () => {
      await expect(purgeStudentData("student-demo")).rejects.toBeInstanceOf(WeeklyReportBusyError);
      expect(await findSubmission("a1", "student-demo")).toBeDefined();
    });
  });
});
