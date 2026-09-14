import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth";
import { CanvasApiError, type CanvasClient } from "../client";
import { resolveStaffCatalog } from "../staffCatalog";
const actor: CurrentUser = { role: "teacher", userId: "fictional", viaLti: true, courseId: "lti-a" };
describe("staff Canvas catalog selection", () => {
  const methods = { listAccountCourses: vi.fn(), getCourseByLtiContext: vi.fn() };
  const client = methods as unknown as CanvasClient;
  beforeEach(() => {
    vi.resetAllMocks();
    methods.listAccountCourses.mockResolvedValue([{ id: 2, name: "Never launched" }, { id: 1, name: "Launch course" }]);
    methods.getCourseByLtiContext.mockResolvedValue({ id: 1, name: "Launch course", lti_context_id: "lti-a" });
  });
  it("defaults to the launch course even when it is not the first entry", async () => {
    const result = await resolveStaffCatalog(actor, client);
    expect(result.state === "ok" && result.selected?.id).toBe(1);
  });
  it("selects an unlaunched course by numeric ID without treating it as an LTI ID", async () => {
    const result = await resolveStaffCatalog(actor, client, "2");
    expect(result.state === "ok" && result.selected?.id).toBe(2);
    expect(methods.getCourseByLtiContext).not.toHaveBeenCalled();
  });
  it.each(["0", "01", "lti-a", ["1", "2"]])("rejects malformed selection %j before network access", async requested => {
    expect((await resolveStaffCatalog(actor, client, requested)).state).toBe("error");
    expect(methods.listAccountCourses).not.toHaveBeenCalled();
  });
  it("rejects a valid numeric ID absent from the catalog", async () => {
    expect((await resolveStaffCatalog(actor, client, "99")).state).toBe("error");
  });
  it("does not pick a course when there is no launch or explicit selection", async () => {
    const result = await resolveStaffCatalog({ ...actor, courseId: undefined }, client);
    expect(result.state === "ok" && result.selected).toBeNull();
  });
  it.each(["student", "guest"] as const)("rejects %s before network access", async role => {
    await expect(resolveStaffCatalog({ ...actor, role }, client, "2")).rejects.toThrow("Forbidden");
    expect(methods.listAccountCourses).not.toHaveBeenCalled();
  });
  it("returns a safe error without falling back after catalog permission failure", async () => {
    methods.listAccountCourses.mockRejectedValue(new CanvasApiError(403, "private response"));
    const result = await resolveStaffCatalog(actor, client);
    expect(result.state).toBe("error");
    expect(JSON.stringify(result)).not.toContain("private response");
    expect(methods.getCourseByLtiContext).not.toHaveBeenCalled();
  });
});
