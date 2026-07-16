import { describe, expect, it, vi } from "vitest";
import { generateKeyPair, jwtVerify, exportJWK } from "jose";
import { requestServiceToken } from "../token";
import { postScore, scoresUrl } from "../ags";
import { getMembership } from "../nrps";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("requestServiceToken", () => {
  it("client_assertion（RS256署名JWT）を送り access_token を返す", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const fetchFn = vi.fn(async () => jsonResponse(200, { access_token: "tok-abc" }));
    const token = await requestServiceToken(
      {
        clientId: "cid-1",
        tokenUrl: "https://canvas/login/oauth2/token",
        privateKey,
        kid: "k1",
        scopes: ["scopeA", "scopeB"],
      },
      fetchFn as unknown as typeof fetch,
    );
    expect(token).toBe("tok-abc");
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const params = new URLSearchParams(init.body as string);
    expect(params.get("grant_type")).toBe("client_credentials");
    expect(params.get("scope")).toBe("scopeA scopeB");
    // client_assertion が公開鍵で検証でき、iss=sub=client_id・aud=tokenUrl
    const assertion = params.get("client_assertion")!;
    const { payload } = await jwtVerify(assertion, publicKey, {
      issuer: "cid-1",
      audience: "https://canvas/login/oauth2/token",
    });
    expect(payload.sub).toBe("cid-1");
  });

  it("非2xxはエラー", async () => {
    const { privateKey } = await generateKeyPair("RS256");
    const fetchFn = vi.fn(async () => jsonResponse(401, {}));
    await expect(
      requestServiceToken(
        { clientId: "c", tokenUrl: "https://t", privateKey, kid: "k", scopes: [] },
        fetchFn as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/HTTP 401/);
  });
});

describe("AGS postScore", () => {
  it("scoresUrl は /scores を付与しクエリを保持する", () => {
    expect(scoresUrl("https://canvas/api/lti/.../lineitems/9")).toBe(
      "https://canvas/api/lti/.../lineitems/9/scores",
    );
    expect(scoresUrl("https://canvas/lineitems/9?type=x")).toBe(
      "https://canvas/lineitems/9/scores?type=x",
    );
  });

  it("Score をLTI形式でPOSTする", async () => {
    const fetchFn = vi.fn(async () => new Response("", { status: 200 }));
    await postScore(
      "https://canvas/lineitems/9",
      "tok",
      { userId: "u-5", scoreGiven: 80, scoreMaximum: 100, comment: "よくできました" },
      fetchFn as unknown as typeof fetch,
    );
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://canvas/lineitems/9/scores");
    expect((init.headers as Record<string, string>)["content-type"]).toContain("score+json");
    const body = JSON.parse(init.body as string);
    expect(body.userId).toBe("u-5");
    expect(body.scoreGiven).toBe(80);
    expect(body.gradingProgress).toBe("FullyGraded");
  });

  it("非2xxはステータスのみのエラー（本文を漏らさない）", async () => {
    const fetchFn = vi.fn(async () => new Response("秘匿本文", { status: 422 }));
    await expect(
      postScore("https://c/lineitems/1", "t", { userId: "u", scoreGiven: 1, scoreMaximum: 1 }, fetchFn as unknown as typeof fetch),
    ).rejects.toThrow(/HTTP 422/);
  });
});

describe("NRPS getMembership", () => {
  it("メンバーをロール写像して返す", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(200, {
        members: [
          { user_id: "u1", name: "デモ生徒01", roles: ["http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"], status: "Active" },
          { user_id: "u2", name: "先生", roles: ["http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"] },
        ],
      }),
    );
    const members = await getMembership("https://canvas/memberships", "tok", fetchFn as unknown as typeof fetch);
    expect(members).toHaveLength(2);
    expect(members[0]).toMatchObject({ userId: "u1", role: "student" });
    expect(members[1].role).toBe("teacher");
  });
});
