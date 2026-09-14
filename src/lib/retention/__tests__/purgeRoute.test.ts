import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { WeeklyReportBusyError } from "@/lib/db/client";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), purge: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.actor }));
vi.mock("@/lib/lti/config", () => ({ getLtiConfig: () => ({ toolUrl: "https://fictional.example" }) }));
vi.mock("@/lib/f3/store", () => ({ purgeStudentData: mocks.purge }));
vi.mock("@/lib/audit/log", () => ({ recordAudit: mocks.audit }));
import { POST } from "../../../../app/api/admin/retention/purge/route";
const body = { confirm: true, withdrawals: [{ studentId: "fictional-a", withdrawnAt: "2000-01-01" }, { studentId: "fictional-b", withdrawnAt: "2000-01-01" }] };
const request = (data: unknown = body, origin = "https://fictional.example") => new NextRequest("https://fictional.example/api/admin/retention/purge", {
  method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(data),
});

describe("retention API safety", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.actor.mockResolvedValue({ role: "admin", viaLti: true, userId: "fictional-admin" });
    mocks.purge.mockResolvedValue({ deletedSubmissions: 1, hadLessonRecords: true, deletedExternalMastery: 0, deletedChatLogs: 0, deletedTeacherMessages: 0, removedFromRoster: true, releasedSeats: 0 });
    mocks.audit.mockResolvedValue(undefined);
  });
  it.each(["guest", "student", "teacher"])("rejects %s before deletion", async role => {
    mocks.actor.mockResolvedValue({ role });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.purge).not.toHaveBeenCalled();
  });
  it("rejects foreign origins", async () => {
    expect((await POST(request(body, "https://other.example"))).status).toBe(403);
    expect(mocks.purge).not.toHaveBeenCalled();
  });
  it("rejects null input without throwing", async () => {
    expect((await POST(request(null))).status).toBe(400);
    expect(mocks.purge).not.toHaveBeenCalled();
  });
  it("reports contention without deletion", async () => {
    mocks.purge.mockRejectedValueOnce(new WeeklyReportBusyError());
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ completedCount: 0, auditedCount: 0 });
  });
  it("reports completed work before a later failure and does not retry", async () => {
    mocks.purge.mockResolvedValueOnce({ deletedSubmissions: 1 }).mockRejectedValueOnce(new Error("fictional-private-value"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toMatchObject({ completedCount: 1, auditedCount: 1 });
    expect(JSON.stringify(data)).not.toContain("fictional-private-value");
    expect(mocks.purge).toHaveBeenCalledTimes(2);
  });
  it("distinguishes committed deletion from failed audit", async () => {
    mocks.audit.mockRejectedValueOnce(new Error("fictional-private-value"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ completedCount: 1, auditedCount: 0 });
    expect(mocks.purge).toHaveBeenCalledTimes(1);
  });
  it("retains successful per-student result counts", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ purgedCount: 2 });
  });
});
