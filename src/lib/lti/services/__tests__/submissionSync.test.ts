import { describe, expect, it, vi } from "vitest";
import { generateKeyPair } from "jose";
import { AGS_SCORE_SCOPE, canSyncSubmission, syncSubmissionToCanvas } from "../submissionSync";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("canSyncSubmission（B-2の可否判定）", () => {
  it("lineitemとスコアスコープが揃っていればtrue", () => {
    expect(
      canSyncSubmission({ lineItem: "https://canvas/lineitems/1", scopes: [AGS_SCORE_SCOPE], sub: "u1" }),
    ).toBe(true);
  });

  it("起動情報が無ければfalse（コースナビ起動などlineitem無しは既定でスキップ）", () => {
    expect(canSyncSubmission(undefined)).toBe(false);
  });

  it("lineitemはあってもスコアスコープが無ければfalse", () => {
    expect(
      canSyncSubmission({ lineItem: "https://canvas/lineitems/1", scopes: ["other-scope"], sub: "u1" }),
    ).toBe(false);
  });
});

describe("syncSubmissionToCanvas", () => {
  it("サービストークンを取得してから提出状態をPOSTする", async () => {
    const { privateKey } = await generateKeyPair("RS256");
    const fetchFn = vi.fn(async (url: string) => {
      if (String(url).includes("/token")) return jsonResponse(200, { access_token: "tok-xyz" });
      return new Response("", { status: 200 });
    });
    await syncSubmissionToCanvas(
      { lineItem: "https://canvas/lineitems/9", scopes: [AGS_SCORE_SCOPE], sub: "u-5" },
      { clientId: "cid", tokenUrl: "https://canvas/token" },
      privateKey,
      "kid-1",
      fetchFn as unknown as typeof fetch,
    );
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [scoreUrl, scoreInit] = fetchFn.mock.calls[1] as unknown as [string, RequestInit];
    expect(scoreUrl).toBe("https://canvas/lineitems/9/scores");
    expect((scoreInit.headers as Record<string, string>).authorization).toBe("Bearer tok-xyz");
    expect(JSON.parse(scoreInit.body as string).userId).toBe("u-5");
  });

  it("トークン取得の失敗はそのまま伝播する（呼び出し側で捕捉する前提）", async () => {
    const { privateKey } = await generateKeyPair("RS256");
    const fetchFn = vi.fn(async () => new Response("", { status: 401 }));
    await expect(
      syncSubmissionToCanvas(
        { lineItem: "https://canvas/lineitems/9", scopes: [AGS_SCORE_SCOPE], sub: "u-5" },
        { clientId: "cid", tokenUrl: "https://canvas/token" },
        privateKey,
        "kid-1",
        fetchFn as unknown as typeof fetch,
      ),
    ).rejects.toThrow();
  });
});
