import { afterEach, describe, expect, it } from "vitest";
import {
  isExpired,
  retentionDeadline,
  retentionYears,
  selectExpired,
} from "../policy";

describe("保持期間ポリシー（Pマーク・未決#10）", () => {
  afterEach(() => {
    delete process.env.RETENTION_YEARS;
  });

  it("既定の保持年数は3年", () => {
    expect(retentionYears()).toBe(3);
  });

  it("RETENTION_YEARS で上書きできる／不正値は既定にフォールバック", () => {
    process.env.RETENTION_YEARS = "5";
    expect(retentionYears()).toBe(5);
    process.env.RETENTION_YEARS = "abc";
    expect(retentionYears()).toBe(3);
    process.env.RETENTION_YEARS = "-1";
    expect(retentionYears()).toBe(3);
  });

  it("退会日 + N年 を保持期限として返す", () => {
    expect(retentionDeadline("2026-04-01", 3).toISOString()).toBe(
      new Date("2029-04-01").toISOString(),
    );
  });

  it("境界値: 保持期限ちょうど・超過は削除対象、直前は対象外", () => {
    const withdrawnAt = "2026-04-01";
    // ちょうど期限（now == deadline）→ 削除対象
    expect(isExpired(withdrawnAt, new Date("2029-04-01"), 3)).toBe(true);
    // 1ミリ秒超過 → 削除対象
    expect(
      isExpired(withdrawnAt, new Date("2029-04-01T00:00:00.001Z"), 3),
    ).toBe(true);
    // 期限の1日前 → 対象外
    expect(isExpired(withdrawnAt, new Date("2029-03-31"), 3)).toBe(false);
  });

  it("不正な退会日は削除対象にしない（安全側）", () => {
    expect(isExpired("not-a-date", new Date("2099-01-01"), 3)).toBe(false);
  });

  it("selectExpired は期限超過の退会者だけを抽出する", () => {
    const now = new Date("2030-01-01");
    const expired = selectExpired(
      [
        { studentId: "a", withdrawnAt: "2026-01-01" }, // 4年前 → 対象
        { studentId: "b", withdrawnAt: "2028-06-01" }, // 1.5年前 → 対象外
        { studentId: "c", withdrawnAt: "bad" }, // 不正 → 対象外
      ],
      now,
      3,
    );
    expect(expired.map((w) => w.studentId)).toEqual(["a"]);
  });
});
