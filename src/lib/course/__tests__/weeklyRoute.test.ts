import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../../../../app/api/admin/reports/weekly/route";
import { WeeklyReportBusyError } from "@/lib/db/client";

const state = vi.hoisted(() => ({
  actor: { role: "admin", viaLti: true, userId: "admin-a", courseId: "course-a" } as Record<string, unknown>,
  generate: vi.fn(async () => ({ report: { weekStart: "2026-09-07", summary: { studentCount: 0 }, alerts: [] }, generatedAt: "2026-09-11", notify: { state: "skipped", reason: "Fictional" } })),
  audit: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => state.actor }));
vi.mock("@/lib/lti/config", () => ({ getLtiConfig: () => ({ toolUrl: "https://fictional.example" }) }));
vi.mock("@/lib/f4/generateWeeklyReport", () => ({ generateWeeklyReport: state.generate }));
vi.mock("@/lib/audit/log", () => ({ recordAudit: state.audit }));
function request(origin = "https://fictional.example") {
  return new NextRequest("https://fictional.example/api/admin/reports/weekly", {
    method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ weekStart: "2026-09-07", courseId: "forged-course" }),
  });
}
describe("weekly report admin boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); state.actor = { role: "admin", viaLti: true, userId: "admin-a", courseId: "course-a" }; });
  it.each(["guest", "student", "teacher"])("rejects %s before generation", async role => {
    state.actor.role = role;
    expect((await POST(request())).status).toBe(403);
    expect(state.generate).not.toHaveBeenCalled();
  });
  it("rejects an administrator without a course", async () => {
    delete state.actor.courseId;
    expect((await POST(request())).status).toBe(403);
    expect(state.generate).not.toHaveBeenCalled();
  });
  it("rejects foreign origins", async () => {
    expect((await POST(request("https://other.example"))).status).toBe(403);
    expect(state.generate).not.toHaveBeenCalled();
  });
  it("uses the session course instead of request data", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(state.generate).toHaveBeenCalledWith({ weekStart: "2026-09-07", courseId: "course-a" });
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ after: expect.objectContaining({ courseId: "course-a" }) }));
  });
  it("reports lock contention without starting an audit", async () => {
    state.generate.mockRejectedValueOnce(new WeeklyReportBusyError());
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(state.audit).not.toHaveBeenCalled();
  });
  it("does not expose generation exceptions", async () => {
    state.generate.mockRejectedValueOnce(new Error("fictional-private-value"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("fictional-private-value");
  });
  it("does not claim success if auditing fails after generation", async () => {
    state.audit.mockRejectedValueOnce(new Error("fictional-private-value"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("fictional-private-value");
    expect(state.generate).toHaveBeenCalledTimes(1);
  });
});
