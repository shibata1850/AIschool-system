import { describe, expect, it } from "vitest";
import { resolveEffectiveRole } from "../resolve";

describe("resolveEffectiveRole", () => {
  it("LTIセッションのロールを最優先する", () => {
    expect(
      resolveEffectiveRole({ ltiRole: "teacher", ltiConfigured: true, cookieRole: "admin", devCookieAllowed: false }),
    ).toBe("teacher");
  });

  it("LTI設定済みでセッション無しは guest（Cookieロールを信用しない）", () => {
    expect(
      resolveEffectiveRole({ ltiRole: null, ltiConfigured: true, cookieRole: "admin", devCookieAllowed: true }),
    ).toBe("guest");
  });

  it("LTI未設定＋開発Cookie許可ではCookieロールを使う", () => {
    expect(
      resolveEffectiveRole({ ltiRole: null, ltiConfigured: false, cookieRole: "teacher", devCookieAllowed: true }),
    ).toBe("teacher");
  });

  it("LTI未設定でも開発Cookie不許可なら昇格しない（開発時は student）", () => {
    expect(
      resolveEffectiveRole({ ltiRole: null, ltiConfigured: false, cookieRole: "admin", devCookieAllowed: false }),
    ).toBe("student");
  });

  // 2026-08-27: さくら初回構築でLTI設定が漏れ、匿名アクセスが student として
  // 演習・AI講師へ到達しうる状態になった（手動対応リスト B10）。本番は最小権限へ倒す
  it("本番でLTI設定漏れなら guest へ倒す（fail-closed）", () => {
    expect(
      resolveEffectiveRole({
        ltiRole: null,
        ltiConfigured: false,
        cookieRole: "admin",
        devCookieAllowed: false,
        isProduction: true,
      }),
    ).toBe("guest");
  });

  it("本番でもLTIセッションがあればそのロールを使う（正常運用は影響を受けない）", () => {
    expect(
      resolveEffectiveRole({
        ltiRole: "teacher",
        ltiConfigured: true,
        cookieRole: undefined,
        devCookieAllowed: false,
        isProduction: true,
      }),
    ).toBe("teacher");
  });

  it("本番でもDEV_COOKIE_ROLES許可時はCookieロールを使う（E2E・デモ運用を壊さない）", () => {
    expect(
      resolveEffectiveRole({
        ltiRole: null,
        ltiConfigured: false,
        cookieRole: "teacher",
        devCookieAllowed: true,
        isProduction: true,
      }),
    ).toBe("teacher");
  });

  it("開発Cookie許可でもCookieが無い/不正なら student", () => {
    expect(resolveEffectiveRole({ ltiRole: null, ltiConfigured: false, cookieRole: undefined, devCookieAllowed: true })).toBe("student");
    expect(resolveEffectiveRole({ ltiRole: null, ltiConfigured: false, cookieRole: "hacker", devCookieAllowed: true })).toBe("student");
  });
});
