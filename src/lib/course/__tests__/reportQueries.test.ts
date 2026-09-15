import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { getAllLessonRecords, getPendingAssignmentsByStudent } from "@/lib/f3/store";

const calls = vi.hoisted(() => ({ table: "", where: undefined as unknown,
  queries: [] as { table: string; where: unknown }[] }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ select: () => {
  const query = {
    from: (table: Parameters<typeof getTableName>[0]) => { calls.table = getTableName(table); return query; },
    innerJoin: () => query,
    where: (condition: unknown) => { calls.where = condition; calls.queries.push({ table: calls.table, where: condition }); return query; },
    orderBy: async () => [],
    then: (resolve: (rows: never[]) => unknown) => Promise.resolve([]).then(resolve),
  };
  return query;
} }) }));

const records = getAllLessonRecords as (courseId?: string | null) => ReturnType<typeof getAllLessonRecords>;
const pending = getPendingAssignmentsByStudent as (courseId?: string | null) => ReturnType<typeof getPendingAssignmentsByStudent>;
const dialect = new PgDialect();

describe("weekly report source queries", () => {
  beforeEach(() => { calls.table = ""; calls.where = undefined; calls.queries = []; });
  it("scopes both attendance and assignment sources to the explicit course", async () => {
    expect(await records("course-a")).toEqual(new Map());
    expect(calls.queries.map(row => row.table)).toEqual(["course_lesson_records", "submissions"]);
    for (const row of calls.queries) {
      const query = dialect.sqlToQuery(row.where as SQL);
      expect(query.params).toEqual(["course-a"]);
      expect(query.sql).toContain(`"${row.table}"."course_id"`);
    }
    expect(dialect.sqlToQuery(calls.queries[1].where as SQL).sql).toContain('"target_week" is not null');
  });
  it("keeps legacy lessons separate when no course is supplied", async () => {
    await records(null);
    expect(calls.table).toBe("lesson_records");
  });
  it("filters pending work by course as well as completion status", async () => {
    await pending("course-a");
    const query = dialect.sqlToQuery(calls.where as SQL);
    expect(query.sql).toContain('"submissions"."course_id"');
    expect(query.params).toContain("course-a");
    expect(query.params).toContain("completed");
  });
  it("does not include scoped submissions in the legacy query", async () => {
    await pending(null);
    expect(dialect.sqlToQuery(calls.where as SQL).sql).toContain('"submissions"."course_id" is null');
  });
  it("excludes future and unknown teaching weeks from a dated report", async () => {
    await getPendingAssignmentsByStudent("course-a", undefined, "2026-09-14");
    const query = dialect.sqlToQuery(calls.where as SQL);
    expect(query.sql).toContain('"submissions"."target_week" <=');
    expect(query.params).toContain("2026-09-14");
  });
});
