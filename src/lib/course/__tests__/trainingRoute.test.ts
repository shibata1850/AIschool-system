import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), config: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.actor }));
vi.mock("@/lib/lti/config", () => ({ getLtiConfig: mocks.config }));
vi.mock("../trainingStore", async importOriginal => ({
  ...await importOriginal<typeof import("../trainingStore")>(), saveTrainingSettings: mocks.save,
}));
import { POST } from "../../../../app/api/teacher/training/route";
import { TrainingSettingsError } from "../trainingStore";

const actor = { role: "teacher", userId: "fictional-teacher", viaLti: true, courseId: "course-a" };
const request = (origin = "https://app.example.test", body = "{}", contentType = "application/json") =>
  new Request("https://app.example.test/api/teacher/training", { method: "POST",
    headers: { origin, "content-type": contentType }, body });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue(actor);
  mocks.config.mockReturnValue({ toolUrl: "https://app.example.test" });
  mocks.save.mockResolvedValue({ revision: 1 });
});
it.each(["student", "guest"])("denies %s", async role => {
  mocks.actor.mockResolvedValue({ ...actor, role });
  expect((await POST(request())).status).toBe(403);
  expect(mocks.save).not.toHaveBeenCalled();
});
it("denies non-LTI access", async () => {
  mocks.actor.mockResolvedValue({ ...actor, viaLti: false });
  expect((await POST(request())).status).toBe(403);
});
it.each(["", "https://evil.example.test", "null"])("denies invalid origin %s", async origin => {
  expect((await POST(request(origin))).status).toBe(403);
  expect(mocks.save).not.toHaveBeenCalled();
});
it.each([undefined, "not a url"])("denies missing or broken tool config", async toolUrl => {
  mocks.config.mockReturnValue({ toolUrl });
  expect((await POST(request())).status).toBe(403);
});
it("rejects invalid JSON", async () => {
  expect((await POST(request(undefined, "{"))).status).toBe(400);
});
it("rejects non-JSON content", async () => {
  expect((await POST(request(undefined, "{}", "text/plain"))).status).toBe(415);
});
it("uses only server-controlled link policy", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.save).toHaveBeenCalledWith(actor, {}, { materialUrls: [], quizUrls: [] });
});
it.each([400, 403, 409] as const)("preserves expected status %s", async status => {
  mocks.save.mockRejectedValue(new TrainingSettingsError("テスト", status));
  expect((await POST(request())).status).toBe(status);
});
it("does not expose database error details", async () => {
  mocks.save.mockRejectedValue(new Error("secret-database-details"));
  const response = await POST(request());
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("secret-database-details");
});
