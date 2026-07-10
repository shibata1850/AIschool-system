import { describe, expect, it } from "vitest";
import { resolveEffectiveRole } from "../resolve";

describe("resolveEffectiveRole", () => {
  it("LTIセッションのロールを最優先する", () => {
    expect(
      resolveEffectiveRole({ ltiRole: "teacher", ltiConfigured: true, cookieRole: "admin" }),
    ).toBe("teacher");
  });

  it("LTI設定済みでセッション無しは guest（Cookieロールを信用しない）", () => {
    expect(
      resolveEffectiveRole({ ltiRole: null, ltiConfigured: true, cookieRole: "admin" }),
    ).toBe("guest");
  });

  it("LTI未設定（デモ）ではCookieロールを使う", () => {
    expect(
      resolveEffectiveRole({ ltiRole: null, ltiConfigured: false, cookieRole: "teacher" }),
    ).toBe("teacher");
  });

  it("LTI未設定でCookieが無い/不正なら student", () => {
    expect(resolveEffectiveRole({ ltiRole: null, ltiConfigured: false, cookieRole: undefined })).toBe("student");
    expect(resolveEffectiveRole({ ltiRole: null, ltiConfigured: false, cookieRole: "hacker" })).toBe("student");
  });
});
