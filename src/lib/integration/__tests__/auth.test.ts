import { describe, expect, it } from "vitest";
import { verifyIntegrationToken } from "../auth";

/**
 * 外部システム連携APIの認証（E7）。
 * 相手はサーバーなので、人向けのログインとは別に専用トークン1本で判定する。
 */

const VALID = "x".repeat(40);

describe("verifyIntegrationToken", () => {
  it("正しいトークンなら通す", () => {
    const r = verifyIntegrationToken(`Bearer ${VALID}`, { INTEGRATION_API_TOKEN: VALID });
    expect(r.ok).toBe(true);
  });

  it("**未設定なら503**（401ではない。設定漏れと認証失敗を混同させない）", () => {
    const r = verifyIntegrationToken(`Bearer ${VALID}`, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
  });

  it("未設定のとき、どんなトークンでも通らない（fail-closed）", () => {
    for (const header of [null, "Bearer ", "Bearer whatever", "Basic xxx"]) {
      const r = verifyIntegrationToken(header, { INTEGRATION_API_TOKEN: undefined });
      expect(r.ok).toBe(false);
    }
  });

  it("**短すぎるトークンは設定ごと拒否する**（総当たり耐性が無くなるため）", () => {
    const short = "short-token";
    const r = verifyIntegrationToken(`Bearer ${short}`, { INTEGRATION_API_TOKEN: short });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
  });

  it("トークンが違えば401", () => {
    const r = verifyIntegrationToken(`Bearer ${"y".repeat(40)}`, {
      INTEGRATION_API_TOKEN: VALID,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("長さが違うトークンでも例外にならず401を返す（比較で落ちない）", () => {
    for (const presented of ["", "z", "z".repeat(200)]) {
      const r = verifyIntegrationToken(`Bearer ${presented}`, {
        INTEGRATION_API_TOKEN: VALID,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(401);
    }
  });

  it("Bearer 以外の方式・ヘッダー欠落は401", () => {
    for (const header of [null, "", VALID, `Basic ${VALID}`, `bearer ${VALID}`]) {
      const r = verifyIntegrationToken(header, { INTEGRATION_API_TOKEN: VALID });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(401);
    }
  });
});
