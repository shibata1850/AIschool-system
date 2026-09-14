import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), config: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.actor }));
vi.mock("@/lib/lti/config", () => ({ getLtiConfig: mocks.config }));
vi.mock("@/lib/canvas/assignmentLinks", () => ({ createCanvasAssignmentLink: mocks.create }));
import { POST } from "../../../../app/api/teacher/assignment-links/route";
import { AssignmentLinkError } from "@/lib/canvas/assignmentLinkPolicy";
import { CanvasApiError } from "@/lib/canvas/client";
const body = { assignmentId: "a1", canvasAssignmentId: 900 };
const request = (input: unknown = body, origin: string | null = "https://tool.example") => new Request("https://tool.example/api/teacher/assignment-links", {
  method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(input),
});

describe("assignment link registration boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ role: "teacher", userId: "fictional-teacher", viaLti: true, courseId: "course-a" });
    mocks.config.mockReturnValue({ toolUrl: "https://tool.example" });
    mocks.create.mockResolvedValue({ created: true });
  });
  it("uses the authenticated actor and ignores a submitted course", async () => {
    const response = await POST(request({ ...body, courseId: "course-b" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ created: true });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ courseId: "course-a" }), "a1", 900);
  });
  it.each(["student", "guest"])("rejects %s before creating anything", async role => {
    mocks.actor.mockResolvedValue({ role, viaLti: true, courseId: "course-a" });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects a teacher without a course", async () => {
    mocks.actor.mockResolvedValue({ role: "teacher", viaLti: true });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([null, "https://other.example"])("rejects origin %s", async origin => {
    expect((await POST(request(body, origin))).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { assignmentId: "a1", canvasAssignmentId: "900" }, { assignmentId: "a1", canvasAssignmentId: 0 }])("rejects malformed input %j", async input => {
    expect((await POST(request(input))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("reports a conflicting link without treating it as success", async () => {
    mocks.create.mockRejectedValue(new AssignmentLinkError("登録済みです", 409));
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.text()).toBe("登録済みです");
  });
  it("does not expose a Canvas error body", async () => {
    mocks.create.mockRejectedValue(new CanvasApiError(500, "private response"));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("private response");
  });
  it("does not expose database errors", async () => {
    mocks.create.mockRejectedValue(new Error("private database data"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private database data");
  });
});
