import { describe, expect, it } from "vitest";
import { canReadAllCourses, courseAccess } from "../access";
import type { CurrentUser } from "@/lib/auth";

describe("staff cross-course read permission", () => {
  const prod = { NODE_ENV: "production" };
  it.each(["teacher", "admin"])("allows verified %s even without a selected course", role => {
    const actor = { role, viaLti: true, userId: "fictional-staff" } as CurrentUser;
    expect(canReadAllCourses(actor, prod)).toBe(true);
    expect(courseAccess(actor, prod)).toBeNull();
  });
  it.each(["student", "guest"])("never grants %s cross-course access", role => {
    expect(canReadAllCourses({ role, viaLti: true, userId: "fictional", courseId: "course-a" } as CurrentUser, prod)).toBe(false);
  });
  it("rejects unverified staff in production", () => {
    expect(canReadAllCourses({ role: "teacher", viaLti: false, userId: "fictional" } as CurrentUser, prod)).toBe(false);
  });
});
