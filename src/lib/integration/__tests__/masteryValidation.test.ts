import { describe, expect, it } from "vitest";
import { validateMasteryPayload } from "../mastery";

/**
 * 到達度受信（E7-c）の入力検証。
 * 送信元は人ではなく別システムなので、**何が悪かったかを機械可読で返す**必要がある
 * （先方要件定義書 E7 例外4「受理されなかった場合は再送できること」）。
 */

const ok = (over: Record<string, unknown> = {}) => ({
  studentId: "s1",
  unitId: "a1",
  score: 72,
  measuredAt: "2026-09-01T00:00:00.000Z",
  ...over,
});

describe("validateMasteryPayload", () => {
  it("正常系: 必須項目がそろっていれば受理する", () => {
    const r = validateMasteryPayload({ items: [ok()] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.items).toHaveLength(1);
      expect(r.items[0].score).toBe(72);
    }
  });

  it("**score: null は「測定中」として受理する**（0点にしない）", () => {
    const r = validateMasteryPayload({ items: [ok({ score: null })] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.items[0].score).toBeNull();
  });

  it("score の指定漏れ（undefined）は測定中と区別して弾く", () => {
    const item = ok();
    delete (item as Record<string, unknown>).score;
    const r = validateMasteryPayload({ items: [item] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].field).toBe("score");
  });

  it("算出根拠（reasons）は文字列配列なら受理する", () => {
    const r = validateMasteryPayload({ items: [ok({ reasons: ["第2章の誤答が多い"] })] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.items[0].reasons).toEqual(["第2章の誤答が多い"]);
  });

  it("**1件でも不正なら全体を拒否する**（部分適用しない）", () => {
    const r = validateMasteryPayload({ items: [ok(), ok({ unitId: "" })] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0].index).toBe(1);
      expect(r.errors[0].field).toBe("unitId");
    }
  });

  it("入力エラー: 本文がオブジェクトでない／items が配列でない", () => {
    for (const bad of [null, "文字列", 42, [], { items: "配列ではない" }, {}]) {
      expect(validateMasteryPayload(bad).ok).toBe(false);
    }
  });

  it("境界値: score は 0 と 100 を受理し、-1 と 101 を拒否する", () => {
    for (const score of [0, 100]) {
      expect(validateMasteryPayload({ items: [ok({ score })] }).ok).toBe(true);
    }
    for (const score of [-1, 101, 50.5, "72"]) {
      expect(validateMasteryPayload({ items: [ok({ score })] }).ok).toBe(false);
    }
  });

  it("境界値: items は1件から500件まで。0件と501件は拒否する", () => {
    expect(validateMasteryPayload({ items: [] }).ok).toBe(false);
    expect(validateMasteryPayload({ items: [ok()] }).ok).toBe(true);
    const many = (n: number) => Array.from({ length: n }, () => ok());
    expect(validateMasteryPayload({ items: many(500) }).ok).toBe(true);
    expect(validateMasteryPayload({ items: many(501) }).ok).toBe(false);
  });

  it("measuredAt が日時として読めなければ拒否する", () => {
    for (const measuredAt of ["", "きのう", "2026-13-45", 20260901]) {
      const r = validateMasteryPayload({ items: [ok({ measuredAt })] });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.some((e) => e.field === "measuredAt")).toBe(true);
    }
  });

  it("studentId・unitId の空白のみは必須未入力として扱う", () => {
    expect(validateMasteryPayload({ items: [ok({ studentId: "   " })] }).ok).toBe(false);
    expect(validateMasteryPayload({ items: [ok({ unitId: "\t" })] }).ok).toBe(false);
  });
});
