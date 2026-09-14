import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), tiles: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.actor }));
vi.mock("@/lib/f3/staffMonitor", () => ({ getStaffMonitor: mocks.tiles }));
vi.mock("../../../../app/teacher/monitor/message-box", () => ({ MessageBox: () => "MESSAGE_CONTROL" }));
vi.mock("../../../../app/teacher/monitor/outage-banner", () => ({ OutageBanner: () => null }));
import MonitorPage from "../../../../app/teacher/monitor/page";

describe("staff monitoring view", () => {
  it("renders shared seats once, course states separately, and no other-course message control", async () => {
    mocks.actor.mockResolvedValue({ role: "teacher", viaLti: true, userId: "staff", courseId: "a" });
    mocks.tiles.mockResolvedValue([
      { student: { id: "shared", displayName: "Fictional shared", seatNo: 2 }, canMessage: true,
        states: [{ courseId: "a", status: "completed", attendedNoSubmit: false }, { courseId: "b", status: "submitted", attendedNoSubmit: true }] },
      { student: { id: "other", displayName: "Fictional other", seatNo: 3 }, canMessage: false,
        states: [{ courseId: "b", status: "not_started", attendedNoSubmit: false }] },
    ]);
    const html = renderToStaticMarkup(await MonitorPage());
    expect(html.match(/aria-label="座席2 Fictional shared"/g)).toHaveLength(1);
    expect(html).toContain("起動元コース");
    expect(html).toContain("コース b");
    expect(html).toContain("出席・未提出");
    expect(html).toContain("閲覧のみ（起動元コース外の受講生）");
    expect(html.match(/MESSAGE_CONTROL/g)).toHaveLength(1);
  });
});
