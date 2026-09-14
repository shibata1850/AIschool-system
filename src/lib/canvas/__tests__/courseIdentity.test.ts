import { describe, expect, it, vi } from "vitest";
import { CanvasClient } from "../client";

function fixture(body: unknown, status = 200) {
  const fetchFn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  return { fetchFn, client: new CanvasClient({ baseUrl: "https://canvas.example.test", apiToken: "fictional-token", fetchFn }) };
}

describe("Canvas verified course identity", () => {
  it("resolves directly by encoded LTI identity without listing other courses", async () => {
    const { client, fetchFn } = fixture({ id: 42, name: "架空コース", lti_context_id: "course-a?x=1" });
    expect((await client.getCourseByLtiContext("course-a?x=1")).id).toBe(42);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url] = fetchFn.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://canvas.example.test/api/v1/courses/lti_context_id:course-a%3Fx%3D1?include[]=lti_context_id");
  });

  it("rejects empty context before requesting Canvas", async () => {
    const { client, fetchFn } = fixture({ id: 1 });
    await expect(client.getCourseByLtiContext(" ")).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    { id: 42, name: "架空コース", lti_context_id: "course-b" },
    { id: 42, name: "架空コース" },
    { id: "42", name: "架空コース", lti_context_id: "course-a" },
    { id: -1, name: "架空コース", lti_context_id: "course-a" },
  ])("rejects a missing or mismatched course identity", async (body) => {
    const { client } = fixture(body);
    await expect(client.getCourseByLtiContext("course-a")).rejects.toThrow();
  });

  it("does not fall back after Canvas returns 404", async () => {
    const { client, fetchFn } = fixture({ error: "not found" }, 404);
    await expect(client.getCourseByLtiContext("course-a")).rejects.toThrow();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
