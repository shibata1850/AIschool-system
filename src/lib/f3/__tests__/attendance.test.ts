import { describe, expect, it, beforeEach } from "vitest";
import { getAttendance, resetStore, setAttendance } from "../store";

describe("出席記録（setAttendance / getAttendance）", () => {
  beforeEach(() => resetStore());

  it("記録が無い週は作成し、以降取得できる", () => {
    const r = setAttendance("s05", "2026-11-09", true);
    expect(r.changed).toBe(true);
    expect(r.before).toBe("none");
    expect(getAttendance("s05", "2026-11-09")).toBe(true);
  });

  it("既存週の出席を更新できる（変更前を返す）", () => {
    setAttendance("s05", "2026-11-09", true);
    const r = setAttendance("s05", "2026-11-09", false);
    expect(r.changed).toBe(true);
    expect(r.before).toBe(true);
    expect(getAttendance("s05", "2026-11-09")).toBe(false);
  });

  it("同じ値の再記録は changed=false（監査に無変更を残さない）", () => {
    setAttendance("s05", "2026-11-09", true);
    expect(setAttendance("s05", "2026-11-09", true).changed).toBe(false);
  });

  it("計測不能（dataMissing）週に出席を付けると計測可能になる", () => {
    // 最小シードの student-demo は 2026-10-12 が dataMissing
    const r = setAttendance("student-demo", "2026-10-12", true);
    expect(r.changed).toBe(true);
    expect(getAttendance("student-demo", "2026-10-12")).toBe(true);
  });

  it("記録が無い受講生・週は undefined", () => {
    expect(getAttendance("s05", "2099-01-01")).toBeUndefined();
  });
});
