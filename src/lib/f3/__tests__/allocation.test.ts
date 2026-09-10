import { beforeEach, describe, expect, it } from "vitest";
import { allocateAssignment, listAllocationOptions } from "../allocation";
import { recordStudentLaunch } from "@/lib/roster";
import { resetStore, findSubmission, updateSubmissionIfVersion, hasAssignmentsForStudent } from "../store";
const teacher={role:"teacher" as const,userId:"teacher",viaLti:true,courseId:"course-a"};
describe("course-scoped assignment persistence",()=>{
  beforeEach(async()=>{await resetStore();await recordStudentLaunch({id:"new-student",displayName:"Fictional",courseId:"course-a"});});
  it("allocates once even under concurrent requests",async()=>{
    const results=await Promise.all([allocateAssignment(teacher,"a1",["new-student"]),allocateAssignment(teacher,"a1",["new-student"])]);
    expect(results.reduce((n,r)=>n+r.created,0)).toBe(1);
    expect((await findSubmission("a1","new-student"))?.status).toBe("not_started");
  });
  it("does not modify completed work",async()=>{
    await allocateAssignment(teacher,"a1",["new-student"]);
    const base=(await findSubmission("a1","new-student"))!;
    await updateSubmissionIfVersion({...base,status:"completed",teacherScore:91,promptText:"Preserved"},1,"not_started");
    expect(await allocateAssignment(teacher,"a1",["new-student"])).toEqual({created:0,skipped:1});
    expect(await findSubmission("a1","new-student")).toMatchObject({teacherScore:91,promptText:"Preserved",status:"completed"});
  });
  it("rejects another course without partial writes",async()=>{
    await recordStudentLaunch({id:"other",courseId:"course-b"});
    await expect(allocateAssignment(teacher,"a1",["new-student","other"])).rejects.toThrow();
    expect(await findSubmission("a1","new-student")).toBeUndefined();
  });
  it("relaunch neither duplicates membership nor assigns implicitly",async()=>{
    await recordStudentLaunch({id:"new-student",courseId:"course-a"});
    expect((await listAllocationOptions("course-a")).roster).toHaveLength(1);
    expect(await hasAssignmentsForStudent("new-student")).toBe(false);
  });
});
