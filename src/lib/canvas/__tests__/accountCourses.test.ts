import { describe, expect, it, vi } from "vitest";
import { CanvasClient } from "../client";

describe("Canvas root account course catalog", () => {
  it("follows account pagination and removes duplicate courses", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, name: "Fictional A" }]), {
        headers: { link: '<https://canvas.example/api/v1/accounts/self/courses?page=2>; rel="next"' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, name: "Fictional A" }, { id: 2, name: "Never launched" }])));
    const client = new CanvasClient({ baseUrl: "https://canvas.example", apiToken: "fictional", fetchFn });
    expect((await client.listAccountCourses()).map(course => course.id)).toEqual([1, 2]);
    expect(fetchFn.mock.calls[0][0]).toBe("https://canvas.example/api/v1/accounts/self/courses?per_page=100");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it("does not fall back to enrolled courses after an authorization error", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 403 }));
    const client = new CanvasClient({ baseUrl: "https://canvas.example", apiToken: "fictional", fetchFn });
    await expect(client.listAccountCourses()).rejects.toMatchObject({ status: 403 });
    expect(fetchFn).toHaveBeenCalledOnce();
  });
  it("rejects malformed course identifiers", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: "2", name: "Fictional" }])));
    const client = new CanvasClient({ baseUrl: "https://canvas.example", apiToken: "fictional", fetchFn });
    await expect(client.listAccountCourses()).rejects.toThrow("コース一覧");
  });
});
