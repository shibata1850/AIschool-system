import { describe, expect, it, vi } from "vitest";
import { CanvasApiError, type CanvasClient } from "@/lib/canvas/client";
import { notifyWeeklyReport, type NotifyResult } from "../notifyReport";
import { buildWeeklyReport, type WeeklyReport } from "../weeklyReport";

const report = buildWeeklyReport({
  weekStart: "2026-09-07", students: [],
  recordsByStudent: new Map(), pendingByStudent: new Map(),
});
const notify = notifyWeeklyReport as (
  report: WeeklyReport, client: CanvasClient | null, courseId?: string | null,
) => Promise<NotifyResult>;

function fixture() {
  const client = {
    listCourses: vi.fn(async () => [{ id: 7 }, { id: 8 }]),
    getCourseByLtiContext: vi.fn(async () => ({ id: 7, name: "Course A", lti_context_id: "course-a" })),
    listTeachers: vi.fn(async (id: number) => id === 7 ? [{ id: 101 }, { id: 101 }, { id: 102 }] : [{ id: 201 }]),
    createConversation: vi.fn(async () => ({})),
  };
  return { client, api: client as unknown as CanvasClient };
}

describe("weekly notification course boundary", () => {
  it.each([undefined, null, "", "   "])("does not send without a course: %s", async (course) => {
    const { client, api } = fixture();
    expect((await notify(report, api, course)).state).toBe("skipped");
    expect(client.listCourses).not.toHaveBeenCalled();
    expect(client.listTeachers).not.toHaveBeenCalled();
    expect(client.createConversation).not.toHaveBeenCalled();
  });

  it("only sends to unique teachers of the resolved course", async () => {
    const { client, api } = fixture();
    expect(await notify(report, api, "course-a")).toEqual({ state: "sent", recipientCount: 2 });
    expect(client.getCourseByLtiContext).toHaveBeenCalledWith("course-a");
    expect(client.listCourses).not.toHaveBeenCalled();
    expect(client.listTeachers).toHaveBeenCalledExactlyOnceWith(7);
    expect(client.createConversation).toHaveBeenCalledWith([101, 102], expect.stringContaining("2026-09-07"), expect.any(String));
  });

  it("does not fall back to another course when there are no teachers", async () => {
    const { client, api } = fixture();
    client.listTeachers.mockResolvedValue([]);
    expect((await notify(report, api, "course-a")).state).toBe("skipped");
    expect(client.listTeachers).toHaveBeenCalledExactlyOnceWith(7);
    expect(client.createConversation).not.toHaveBeenCalled();
  });

  it("does not send if course resolution fails", async () => {
    const { client, api } = fixture();
    client.getCourseByLtiContext.mockRejectedValue(new CanvasApiError(404, "private response"));
    expect((await notify(report, api, "course-a")).state).toBe("error");
    expect(client.createConversation).not.toHaveBeenCalled();
  });

  it("does not expose exception secrets", async () => {
    const { client, api } = fixture();
    client.createConversation.mockRejectedValue(new Error("fictional-private-token"));
    const result = await notify(report, api, "course-a");
    expect(result.state).toBe("error");
    expect(JSON.stringify(result)).not.toContain("fictional-private-token");
  });

  it("keeps the disconnected state without sending", async () => {
    expect((await notify(report, null, "course-a")).state).toBe("skipped");
  });
});
