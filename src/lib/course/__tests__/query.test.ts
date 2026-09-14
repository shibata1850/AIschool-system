import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { submissions, chatLogs, teacherMessages } from "@/lib/db/schema";
import { inCourse } from "../query";

const dialect = new PgDialect();
describe("course SQL filters", () => {
  it.each([submissions.courseId, chatLogs.courseId, teacherMessages.courseId])("binds the course as a parameter", (column) => {
    const query = dialect.sqlToQuery(inCourse(column, "fictional-course-a"));
    expect(query.sql).toContain("= $1");
    expect(query.params).toEqual(["fictional-course-a"]);
  });

  it("treats legacy ownership as IS NULL, never all courses", () => {
    const query = dialect.sqlToQuery(inCourse(submissions.courseId, null));
    expect(query.sql).toContain('"submissions"."course_id" is null');
    expect(query.params).toEqual([]);
  });
});
