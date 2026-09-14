import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), records: vi.fn(), mastery: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.actor }));
vi.mock("@/lib/f3/store", () => ({ getLessonRecords: mocks.records }));
vi.mock("@/lib/integration/mastery", () => ({ getExternalMasteryForStudent: mocks.mastery }));
import Page from "../../../../app/achievement/page";

describe("personal achievement view scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ role: "student", viaLti: true, userId: "student-a", courseId: "course-a" });
    mocks.records.mockResolvedValue([]);
    mocks.mastery.mockResolvedValue([]);
  });

  it.each(["student", "teacher", "admin"])("scopes %s to their own records in the launched course", async role => {
    mocks.actor.mockResolvedValue({ role, viaLti: true, userId: "actor-a", courseId: "course-b" });
    expect(renderToStaticMarkup(await Page())).toContain("自分の到達度");
    expect(mocks.records).toHaveBeenCalledWith("actor-a", "course-b");
    expect(mocks.mastery).toHaveBeenCalledWith("actor-a", "course-b");
  });

  it.each([
    { role: "guest", viaLti: true, courseId: "course-a" },
    { role: "student", viaLti: true },
    { role: "student", viaLti: true, courseId: "   " },
  ])("rejects invalid course access before reading data: %j", async actor => {
    mocks.actor.mockResolvedValue({ ...actor, userId: "student-a" });
    await expect(Page()).rejects.toThrow();
    expect(mocks.records).not.toHaveBeenCalled();
    expect(mocks.mastery).not.toHaveBeenCalled();
  });
});
