import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { CurrentUser } from "@/lib/auth";
const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.db }));
import { legacyPageNumber, readOwnLegacyHistory } from "../legacyHistory";

const actor: CurrentUser = { role: "student", userId: "authenticated-owner", viaLti: true, courseId: "course-a" };

describe("own legacy history", () => {
  beforeEach(() => vi.resetAllMocks());
  it.each([undefined, "1", "2"])("accepts canonical page %s", value => {
    expect(legacyPageNumber(value)).toBe(value === "2" ? 2 : 1);
  });
  it.each(["0", "-1", "1.5", "01", "1e2", "1000000", ["1", "2"]])("rejects invalid page %s", value => {
    expect(legacyPageNumber(value)).toBeNull();
  });
  it.each([
    { ...actor, role: "guest" }, { ...actor, courseId: undefined }, { ...actor, userId: " " },
  ])("rejects invalid authentication before querying", async invalid => {
    await expect(readOwnLegacyHistory(invalid as CurrentUser)).rejects.toThrow("Forbidden");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("rejects invalid pagination before querying", async () => {
    await expect(readOwnLegacyHistory(actor, -1)).rejects.toThrow("Invalid page");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it.each(["student", "teacher", "admin"] as const)("restricts every %s query to the actor, and nullable tables to NULL only", async role => {
    const conditions: SQL[] = [];
    const limits: number[] = [];
    const offsets: number[] = [];
    const select = vi.fn((_fields: Record<string, unknown>) => {
      const query = {
        from: () => query, leftJoin: () => query,
        where: (condition: SQL) => { conditions.push(condition); return query; },
        orderBy: () => query,
        limit: (n: number) => { limits.push(n); return query; },
        offset: (n: number) => { offsets.push(n); return Promise.resolve(Array.from({ length: 51 }, (_, id) => ({ id }))); },
      };
      return query;
    });
    mocks.db.mockReturnValue({ select });
    const result = await readOwnLegacyHistory({ ...actor, role }, 2);
    const compiled = conditions.map(condition => new PgDialect().sqlToQuery(condition));
    expect(compiled).toHaveLength(4);
    for (const query of compiled) {
      expect(query.params).toEqual([actor.userId]);
      expect(query.sql).toContain('"student_id" = $1');
    }
    for (const query of compiled.slice(0, 3)) expect(query.sql).toContain('"course_id" is null');
    expect(compiled[3].sql).toContain('"lesson_records"');
    expect(limits).toEqual([51, 51, 51, 51]);
    expect(offsets).toEqual([50, 50, 50, 50]);
    expect(result.hasNext).toBe(true);
    for (const rows of [result.submissions, result.chats, result.messages, result.lessons]) expect(rows).toHaveLength(50);
    const fields = Object.keys(select.mock.calls[0]?.[0] ?? {});
    expect(fields).not.toContain("aiGrade");
    expect(fields).not.toContain("canvasUserId");
    expect(fields).not.toContain("rationale");
  });
});
