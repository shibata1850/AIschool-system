import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), history: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.actor }));
vi.mock("@/lib/course/legacyHistory", async original => ({
  ...await original<typeof import("../legacyHistory")>(), readOwnLegacyHistory: mocks.history,
}));
import Page from "../../../../app/achievement/history/page";

describe("legacy history view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ role: "student", userId: "owner", viaLti: true, courseId: "course-a" });
    mocks.history.mockResolvedValue({ page: 1, hasNext: false, submissions: [], chats: [], messages: [], lessons: [] });
  });
  it("renders an empty read-only history", async () => {
    const html = renderToStaticMarkup(await Page({}));
    expect(html).toContain("旧履歴");
    expect(html).toContain("現在のコースの課題・到達度には含まれません");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("次のページ");
  });
  it.each(["guest", "missing-course"])("denies %s before reading", async kind => {
    mocks.actor.mockResolvedValue({ role: kind === "guest" ? "guest" : "student", userId: "owner", viaLti: true });
    await expect(Page({})).rejects.toThrow();
    expect(mocks.history).not.toHaveBeenCalled();
  });
  it("rejects duplicate page input", async () => {
    await expect(Page({ searchParams: Promise.resolve({ page: ["1", "2"] }) })).rejects.toThrow();
    expect(mocks.history).not.toHaveBeenCalled();
  });
  it("shows zero scores, preserves text, escapes HTML and offers pagination without write actions", async () => {
    mocks.history.mockResolvedValue({ page: 2, hasNext: true,
      submissions: [{ id: "old", title: "Fictional task", status: "completed", teacherScore: 0, promptText: "<script>bad</script>", feedback: "Feedback" }],
      chats: [{ id: 1, askedAt: new Date("2026-09-01T00:00:00Z"), question: "Question", reply: "Reply" }],
      messages: [{ id: 1, sentAt: new Date("2026-09-01T00:00:00Z"), body: "Line one\nLine two" }],
      lessons: [{ weekStart: "2026-08-31", attended: true, submitted: true, score: 0, dataMissing: false }],
    });
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ page: "2" }) }));
    expect(html).toContain("確定スコア: 0");
    expect(html).toContain("Line one\nLine two");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("history?page=1");
    expect(html).toContain("history?page=3");
    expect(html).not.toContain("/exercises/");
    expect(html).not.toContain("<form");
  });
});
