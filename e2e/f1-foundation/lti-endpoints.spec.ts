import { expect, test } from "@playwright/test";

/**
 * LTI 1.3 エンドポイントの疎通（未設定時の挙動）。
 * E2E環境は LTI 未設定のため、login/launch は501、jwks は空キーセットを返す。
 * 実際の起動フローはCanvas登録後にステージングで確認する（docs/LTI連携手順.md）。
 */
test.describe("LTIエンドポイント（未設定時）", () => {
  test("JWKSは200で空のキーセットを返す", async ({ request }) => {
    const res = await request.get("/api/lti/jwks");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ keys: [] });
  });

  test("ログイン開始は未設定なら501", async ({ request }) => {
    const res = await request.get("/api/lti/login?iss=x&login_hint=y&target_link_uri=z");
    expect(res.status()).toBe(501);
  });

  test("起動は未設定なら501", async ({ request }) => {
    const res = await request.post("/api/lti/launch", {
      form: { id_token: "dummy", state: "dummy" },
    });
    expect(res.status()).toBe(501);
  });
});
