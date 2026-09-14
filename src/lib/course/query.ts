import { eq, isNull } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/** Missing course data is isolated, not a wildcard. Authorization precedes this filter. */
export function inCourse(column: AnyPgColumn, courseId: string | null) {
  return courseId === null ? isNull(column) : eq(column, courseId);
}
