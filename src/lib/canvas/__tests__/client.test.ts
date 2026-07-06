import { describe, expect, it, vi } from "vitest";
import { CanvasApiError, CanvasClient, createCanvasClient } from "../client";

function stubFetch(status: number, body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("CanvasClient", () => {
  it("Bearerトークン付きでリクエストする（末尾スラッシュは正規化）", async () => {
    const fetchFn = stubFetch(200, { id: 1, name: "管理者（架空）" });
    const client = new CanvasClient({
      baseUrl: "https://canvas.example.jp/",
      apiToken: "test-token",
      fetchFn,
    });
    const self = await client.getSelf();
    expect(self.id).toBe(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://canvas.example.jp/api/v1/users/self");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-token",
    );
  });

  it("成績反映はPUTで posted_grade とコメントを送る", async () => {
    const fetchFn = stubFetch(200, { id: 10, user_id: 5, workflow_state: "graded", score: 90, submitted_at: null, late: false });
    const client = new CanvasClient({
      baseUrl: "https://canvas.example.jp",
      apiToken: "t",
      fetchFn,
    });
    await client.gradeSubmission(2, 3, 5, 90, "よくできました");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/v1/courses/2/assignments/3/submissions/5");
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body as string);
    expect(body.submission.posted_grade).toBe("90");
    expect(body.comment.text_comment).toBe("よくできました");
  });

  it("スコア範囲外は送信前に拒否する", async () => {
    const fetchFn = stubFetch(200, {});
    const client = new CanvasClient({ baseUrl: "https://c", apiToken: "t", fetchFn });
    await expect(client.gradeSubmission(1, 1, 1, 101)).rejects.toThrow(/0〜100/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("非2xxはステータスのみを含むCanvasApiError（本文を漏らさない）", async () => {
    const fetchFn = stubFetch(401, { errors: [{ message: "秘匿情報を含むかもしれない本文" }] });
    const client = new CanvasClient({ baseUrl: "https://c", apiToken: "t", fetchFn });
    const error = await client.getSelf().catch((e) => e);
    expect(error).toBeInstanceOf(CanvasApiError);
    expect(error.status).toBe(401);
    expect(error.message).not.toContain("秘匿");
  });

  it("createCanvasClient: 環境変数が未設定なら null（インメモリで継続）", () => {
    expect(createCanvasClient({})).toBeNull();
    expect(
      createCanvasClient({ CANVAS_BASE_URL: "https://c" }),
    ).toBeNull();
    expect(
      createCanvasClient({
        CANVAS_BASE_URL: "https://c",
        CANVAS_API_TOKEN: "t",
      }),
    ).toBeInstanceOf(CanvasClient);
  });
});
