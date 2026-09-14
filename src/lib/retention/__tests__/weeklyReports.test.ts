import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { courseWeeklyReports, weeklyReports } from "@/lib/db/schema";
import { reportContainsStudent } from "../weeklyReports";

describe("weekly retention selector", () => {
  it.each([weeklyReports.payload, courseWeeklyReports.payload])("binds exact student IDs in rows and alerts", payload => {
    const id = "fictional-'quoted-student";
    const query = new PgDialect().sqlToQuery(reportContainsStudent(payload, id));
    expect(query.sql).not.toContain(id);
    expect(query.params.map(value => JSON.parse(value as string))).toEqual([
      { rows: [{ studentId: id }] }, { alerts: [{ studentId: id }] },
    ]);
  });
  it("rejects empty selectors", () => {
    expect(() => reportContainsStudent(weeklyReports.payload, "")).toThrow();
  });
});
