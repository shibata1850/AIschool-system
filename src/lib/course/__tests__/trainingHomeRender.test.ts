import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), settings: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.actor }));
vi.mock("../trainingStore", () => ({ readTrainingSettings: mocks.settings }));
vi.mock("@/lib/f2/chatLog", () => ({ listTeacherMessages: async () => [] }));
vi.mock("@/lib/f3/store", () => ({ listActiveSubmissionsForStudent: async () => [], hasAssignmentsForStudent: async () => true }));
import Home from "../../../../app/page";

const settings = { courseId: "fictional-course", mode: "btob", revision: 1, currentDay: 1,
  days: [{ day: 1, title: "研修初日", materialUrl: null, quizUrl: null }] };
beforeEach(() => {
  mocks.actor.mockResolvedValue({ role: "student", viaLti: true, userId: "fictional-student", courseId: "fictional-course" });
  mocks.settings.mockResolvedValue(settings);
});
it("shows the selected lesson and pending links without claiming completion", async () => {
  const html = renderToStaticMarkup(await Home());
  expect(html).toContain("研修初日");
  expect(html).toContain("教材：準備中");
  expect(html).toContain("小テスト：準備中");
  expect(html).not.toContain("すべて完了");
});
it("does not infer day one when no lesson is selected", async () => {
  mocks.settings.mockResolvedValue({ ...settings, currentDay: null });
  const html = renderToStaticMarkup(await Home());
  expect(html).toContain("現在の授業はまだ選択されていません");
  expect(html).not.toContain("研修初日");
});
it("does not render the legacy completion banner when settings cannot be read", async () => {
  mocks.settings.mockRejectedValue(new Error("private-db-details"));
  const html = renderToStaticMarkup(await Home());
  expect(html).toContain('role="alert"');
  expect(html).not.toContain("private-db-details");
  expect(html).not.toContain("すべて完了");
});
it("preserves the existing home for courses without settings", async () => {
  mocks.settings.mockResolvedValue(null);
  expect(renderToStaticMarkup(await Home())).toContain("未提出の課題を、締切が近い順に並べています");
});
it("offers the settings link to teachers but not students", async () => {
  expect(renderToStaticMarkup(await Home())).not.toContain('href="/teacher/training"');
  mocks.actor.mockResolvedValue({ role: "teacher", viaLti: true, userId: "fictional-teacher", courseId: "fictional-course" });
  expect(renderToStaticMarkup(await Home())).toContain('href="/teacher/training"');
});
