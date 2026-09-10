import { describe, expect, it } from "vitest";
import { allocationScope, parseAllocation, emptyAssignmentLabel } from "../allocationPolicy";

describe("assignment allocation policy", () => {
  it.each(["student", "guest"] as const)("denies %s", role => {
    expect(allocationScope({role, userId:"x",viaLti:true,courseId:"course-a"})).toBeNull();
  });
  it.each(["teacher", "admin"] as const)("requires a verified course for %s", role => {
    expect(allocationScope({role,userId:"x",viaLti:false,courseId:"a"})).toBeNull();
    expect(allocationScope({role,userId:"x",viaLti:true})).toBeNull();
    expect(allocationScope({role,userId:"x",viaLti:true,courseId:"a"})).toBe("a");
  });
  it("deduplicates explicit recipients", () => {
    expect(parseAllocation({assignmentId:"a1",studentIds:["s1","s1"]})).toEqual({assignmentId:"a1",studentIds:["s1"]});
  });
  it.each([null, {}, {assignmentId:"a",studentIds:[]}, {assignmentId:"a",studentIds:[42]}, {assignmentId:"a",studentIds:Array(101).fill("s")}])("rejects invalid input", input => {
    expect(parseAllocation(input)).toBeNull();
  });
  it("distinguishes no assignments from completion", () => {
    expect(emptyAssignmentLabel(false)).toBe("まだ課題が割り当てられていません。");
    expect(emptyAssignmentLabel(true)).toBe("すべて完了しています。");
  });
});
