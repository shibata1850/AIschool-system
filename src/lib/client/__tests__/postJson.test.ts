import { afterEach, describe, expect, it, vi } from "vitest";
import { postJson } from "../postJson";

afterEach(() => vi.unstubAllGlobals());

describe("postJson（2026-07-03 夜間レビュー指摘#6の回帰）", () => {
  it("200でもJSONでない応答は成功扱いにしない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>error page</html>", { status: 200 })),
    );
    const result = await postJson("/api/chat", {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("読み取れません");
  });

  it("非2xxはレスポンス本文をエラーメッセージとして返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("スコアを入力してください", { status: 400 })),
    );
    const result = await postJson("/x", {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("スコアを入力してください");
  });

  it("中断（タイムアウト）は aborted フラグ付きで返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("aborted", "AbortError");
      }),
    );
    const result = await postJson("/x", {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.aborted).toBe(true);
  });

  it("通信断は再試行を促す日本語メッセージを返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const result = await postJson("/x", {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("もう一度");
  });
});
