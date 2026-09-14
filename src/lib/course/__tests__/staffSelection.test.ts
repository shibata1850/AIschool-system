import { describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth";
import { staffCourseSelection } from "../staffSelection";
const actor: CurrentUser = { role: "teacher", userId: "fictional", viaLti: true, courseId: "a" };
describe("staff read course selection", () => {
  it("defaults to the launch course and preserves its write permission", () => {
    expect(staffCourseSelection(actor, ["b", "a", "b"])).toEqual({ courses: ["a", "b"], courseId: "a", canEdit: true });
  });
  it("allows other-course and legacy reads without write permission", () => {
    expect(staffCourseSelection(actor, ["b"], "b")?.canEdit).toBe(false);
    expect(staffCourseSelection(actor, ["b"], "")?.courseId).toBeNull();
    expect(staffCourseSelection(actor, ["b"], "")?.canEdit).toBe(false);
  });
  it("allows staff without launch context to browse recorded courses", () => {
    expect(staffCourseSelection({ ...actor, courseId: undefined }, ["b"])?.courseId).toBe("b");
    expect(staffCourseSelection({ ...actor, courseId: undefined }, ["b"])?.canEdit).toBe(false);
  });
  it("rejects unknown and repeated query values", () => {
    expect(staffCourseSelection(actor, ["b"], "unknown")).toBeNull();
    expect(staffCourseSelection(actor, ["b"], ["a", "b"])).toBeNull();
  });
  it.each(["student", "guest"] as const)("rejects %s", role => {
    expect(staffCourseSelection({ ...actor, role }, ["b"], "b")).toBeNull();
  });
});
