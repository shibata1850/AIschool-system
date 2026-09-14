import { describe, expect, it } from "vitest";
import type { CurrentUser, Role } from "@/lib/auth";
import { courseAccess, teacherCourseAccess } from "../access";

const production = { NODE_ENV: "production" };
const actor = (role: Role, courseId: string | undefined = "course-a"): CurrentUser => ({
  role, courseId, viaLti: true, userId: "fictional-user",
});

describe("verified course access", () => {
  it.each(["student", "teacher", "admin"] as const)("limits %s to the verified course", (role) => {
    expect(courseAccess(actor(role), production)).toEqual({ courseId: "course-a" });
    expect(courseAccess(actor(role, "course-b"), production)).toEqual({ courseId: "course-b" });
  });

  it.each([undefined, "", "   "])("rejects missing course %s without development fallback", (courseId) => {
    const input = { ...actor("teacher"), courseId };
    expect(courseAccess(input, production)).toBeNull();
    expect(courseAccess(input, { NODE_ENV: "development", DEV_COOKIE_ROLES: "1" })).toBeNull();
    expect(courseAccess(input, { NODE_ENV: "test" })).toBeNull();
  });

  it.each(["student", "teacher", "admin"] as const)("rejects unverified %s in production even with dev flags", (role) => {
    const input = { ...actor(role), viaLti: false };
    expect(courseAccess(input, production)).toBeNull();
    expect(courseAccess(input, { ...production, DEV_COOKIE_ROLES: "1" })).toBeNull();
  });

  it("rejects guests and unknown runtime roles", () => {
    expect(courseAccess(actor("guest"), production)).toBeNull();
    expect(courseAccess(actor("owner" as Role), production)).toBeNull();
  });

  it("keeps explicitly allowed local demo records separate from all real courses", () => {
    const input = { ...actor("teacher"), viaLti: false };
    expect(courseAccess(input, { NODE_ENV: "development", DEV_COOKIE_ROLES: "1" })).toEqual({ courseId: null });
    expect(courseAccess(input, { NODE_ENV: "test" })).toEqual({ courseId: null });
    expect(courseAccess(input, { NODE_ENV: "development" })).toBeNull();
    expect(courseAccess(input, {})).toBeNull();
  });
});

describe("teacher course access", () => {
  it.each(["teacher", "admin"] as const)("does not grant %s an all-course bypass", (role) => {
    expect(teacherCourseAccess(actor(role), production)).toEqual({ courseId: "course-a" });
    expect(teacherCourseAccess({ ...actor(role), courseId: undefined }, production)).toBeNull();
  });

  it.each(["student", "guest"] as const)("rejects %s in every environment", (role) => {
    expect(teacherCourseAccess(actor(role), production)).toBeNull();
    expect(teacherCourseAccess({ ...actor(role), viaLti: false }, { NODE_ENV: "test" })).toBeNull();
  });
});
