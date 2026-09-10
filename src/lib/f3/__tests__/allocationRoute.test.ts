import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(()=>({actor:vi.fn(),allocate:vi.fn()}));
vi.mock("@/lib/auth",()=>({getCurrentUser:mocks.actor}));
vi.mock("@/lib/lti/config",()=>({getLtiConfig:()=>({toolUrl:"https://school.test"})}));
vi.mock("@/lib/f3/allocation",()=>({allocateAssignment:mocks.allocate,AllocationError:class extends Error{}}));
import { POST } from "../../../../app/api/teacher/assignments/route";
const request = (body:unknown, origin="https://school.test") => new Request("http://localhost:3000/api/teacher/assignments",{
  method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body),
});
describe("allocation API",()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.actor.mockResolvedValue({role:"teacher",viaLti:true,userId:"t",courseId:"c"});mocks.allocate.mockResolvedValue({created:1,skipped:0});});
  it.each(["student","guest"])("blocks %s even without proxy",async role=>{
    mocks.actor.mockResolvedValue({role,viaLti:true,userId:"s",courseId:"c"});
    expect((await POST(request({assignmentId:"a",studentIds:["s"]}))).status).toBe(403);
    expect(mocks.allocate).not.toHaveBeenCalled();
  });
  it("blocks cross-origin requests",async()=>{
    expect((await POST(request({assignmentId:"a",studentIds:["s"]},"https://other.test"))).status).toBe(403);
    expect(mocks.allocate).not.toHaveBeenCalled();
  });
  it("rejects empty recipients",async()=>{
    expect((await POST(request({assignmentId:"a",studentIds:[]}))).status).toBe(400);
  });
  it("uses verified course, not a body override",async()=>{
    const res=await POST(request({assignmentId:"a",studentIds:["s"],courseId:"other"}));
    expect(res.status).toBe(200);
    expect(mocks.allocate).toHaveBeenCalledWith(expect.objectContaining({courseId:"c"}),"a",["s"]);
  });
  it("does not disclose database errors",async()=>{
    mocks.allocate.mockRejectedValue(new Error("PRIVATE_DATA"));
    const res=await POST(request({assignmentId:"a",studentIds:["s"]}));
    expect(res.status).toBe(500);expect(await res.text()).not.toContain("PRIVATE_DATA");
  });
});
