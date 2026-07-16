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

  it("LTI未設定でも開発Cookie不許可なら昇格しない（student・本番fail-safe）", () => {
    expect(
      resolveEffectiveRole({ ltiRole: null, ltiConfigured: false, cookieRole: "admin", devCookieAllowed: false }),
    ).toBe("student");
  });

  it("開発Cookie許可でもCookieが無い/不正なら student", () => {
    expect(resolveEffectiveRole({ ltiRole: null, ltiConfigured: false, cookieRole: undefined, devCookieAllowed: true })).toBe("student");
    expect(resolveEffectiveRole({ ltiRole: null, ltiConfigured: false, cookieRole: "hacker", devCookieAllowed: true })).toBe("student");
  });
});
