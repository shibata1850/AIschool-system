import { describe, expect, it } from "vitest";
import { currentReportWeek, isReportWeek } from "../reportWeek";

describe("Japanese reporting week", () => {
  it.each([
    ["2026-09-06T14:59:59Z", "2026-08-31"],
    ["2026-09-06T15:00:00Z", "2026-09-07"],
    ["2026-09-06T22:00:00Z", "2026-09-07"],
    ["2026-12-31T23:00:00Z", "2026-12-28"],
  ])("resolves %s", (time, expected) => {
    expect(currentReportWeek(new Date(time))).toBe(expected);
  });
  it.each(["", "2026-02-30", "2026-13-01", "2026-09-08", "2026-9-7", null, 123])("rejects invalid week %s", value => {
    expect(isReportWeek(value)).toBe(false);
  });
  it("accepts an actual Monday", () => expect(isReportWeek("2026-09-07")).toBe(true));
});
