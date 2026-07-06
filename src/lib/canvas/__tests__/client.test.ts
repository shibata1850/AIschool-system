import { describe, expect, it, vi } from "vitest";
import { CanvasApiError, CanvasClient, createCanvasClient, parseNextLink } from "../client";

function stubFetch(status: number, body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

/** ページごとに本文とLinkヘッダーを返すスタブ */
function stubPagedFetch(pages: Array<{ body: unknown; link?: string }>) {
  let call = 0;
  return vi.fn(async () => {
    const page = pages[Math.min(call, pages.length - 1)];
    call++;
    return new Response(JSON.stringify(page.body), {
      status: 200,
      headers: {
        "content-type": "application/json",
        ...(page.link ? { link: page.link } : {}),
      },
    });
  });
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

  it("一覧APIはLinkヘッダーの rel=\"next\" を辿って全ページ結合する", async () => {
    const base = "https://canvas.example.jp";
    const fetchFn = stubPagedFetch([
      {
        body: [{ id: 1, name: "コースA（架空）" }],
        link: `<${base}/api/v1/courses?page=2&per_page=100>; rel="next", <${base}/api/v1/courses?page=2&per_page=100>; rel="last"`,
      },
      { body: [{ id: 2, name: "コースB（架空）" }] },
    ]);
    const client = new CanvasClient({ baseUrl: base, apiToken: "t", fetchFn });
    const courses = await client.listCourses();
    expect(courses.map((c) => c.id)).toEqual([1, 2]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [secondUrl] = fetchFn.mock.calls[1] as unknown as [string];
    expect(secondUrl).toBe(`${base}/api/v1/courses?page=2&per_page=100`);
  });

  it("次ページが別ホストを指す場合は辿らない（トークン漏えい防止）", async () => {
    const fetchFn = stubPagedFetch([
      {
        body: [{ id: 1, name: "コースA（架空）" }],
        link: `<https://evil.example.com/api/v1/courses?page=2>; rel="next"`,
      },
      { body: [{ id: 99, name: "取得されてはいけないページ" }] },
    ]);
    const client = new CanvasClient({
      baseUrl: "https://canvas.example.jp",
      apiToken: "t",
      fetchFn,
    });
    const courses = await client.listCourses();
    expect(courses.map((c) => c.id)).toEqual([1]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("ページ追跡は上限で打ち切る（Linkヘッダーが循環しても無限ループしない）", async () => {
    const base = "https://canvas.example.jp";
    // 常に自分自身を rel="next" として返す壊れた応答
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify([{ id: 1, name: "x" }]), {
        status: 200,
        headers: {
          "content-type": "application/json",
          link: `<${base}/api/v1/courses?page=1&per_page=100>; rel="next"`,
        },
      }),
    );
    const client = new CanvasClient({ baseUrl: base, apiToken: "t", fetchFn });
    const courses = await client.listCourses();
    expect(courses.length).toBe(50); // MAX_PAGES 回で停止
    expect(fetchFn).toHaveBeenCalledTimes(50);
  });

  it("受講生名簿は enrollment_type[]=student で絞り込む", async () => {
    const fetchFn = stubFetch(200, [{ id: 7, name: "デモ生徒（架空）" }]);
    const client = new CanvasClient({
      baseUrl: "https://canvas.example.jp",
      apiToken: "t",
      fetchFn,
    });
    const students = await client.listStudents(12);
    expect(students[0].id).toBe(7);
    const [url] = fetchFn.mock.calls[0] as unknown as [string];
    expect(url).toContain("/api/v1/courses/12/users");
    expect(url).toContain("enrollment_type[]=student");
  });

  it("レート制限（403＋X-Rate-Limit-Remaining:0）はバックオフ後に再試行して成功する", async () => {
    let call = 0;
    const fetchFn = vi.fn(async () => {
      call++;
      if (call === 1) {
        return new Response("throttled", {
          status: 403,
          headers: { "x-rate-limit-remaining": "0.0" },
        });
      }
      return new Response(JSON.stringify({ id: 1, name: "管理者（架空）" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const client = new CanvasClient({
      baseUrl: "https://canvas.example.jp",
      apiToken: "t",
      fetchFn,
      retryBaseDelayMs: 0,
    });
    const self = await client.getSelf();
    expect(self.id).toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("レート制限が続く場合は再試行上限で専用メッセージのエラーにする", async () => {
    const fetchFn = vi.fn(async () =>
      new Response("throttled", {
        status: 429,
        headers: { "x-rate-limit-remaining": "0.0" },
      }),
    );
    const client = new CanvasClient({
      baseUrl: "https://canvas.example.jp",
      apiToken: "t",
      fetchFn,
      retryBaseDelayMs: 0,
    });
    const error = await client.getSelf().catch((e) => e);
    expect(error).toBeInstanceOf(CanvasApiError);
    expect(error.status).toBe(429);
    expect(error.message).toContain("レート制限");
    expect(fetchFn).toHaveBeenCalledTimes(3); // 初回＋再試行2回
  });

  it("権限エラーの403（レート制限ヘッダーなし）は再試行しない", async () => {
    const fetchFn = vi.fn(async () => new Response("forbidden", { status: 403 }));
    const client = new CanvasClient({
      baseUrl: "https://canvas.example.jp",
      apiToken: "t",
      fetchFn,
      retryBaseDelayMs: 0,
    });
    const error = await client.getSelf().catch((e) => e);
    expect(error).toBeInstanceOf(CanvasApiError);
    expect(error.status).toBe(403);
    expect(error.message).not.toContain("レート制限");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("parseNextLink: rel=\"next\" のURLのみ取り出す", () => {
    expect(parseNextLink(null)).toBeNull();
    expect(parseNextLink('<https://c/api?page=3>; rel="last"')).toBeNull();
    expect(
      parseNextLink('<https://c/api?page=2>; rel="next", <https://c/api?page=9>; rel="last"'),
    ).toBe("https://c/api?page=2");
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
