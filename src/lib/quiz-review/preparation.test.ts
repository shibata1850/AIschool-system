import {it,expect,vi} from "vitest";
import {prepareReport} from "./preparation";
const origin="https://canvas.example.test";
function fixture(mode="ready") {
  let state=mode;
  const report=()=>({id:81,quiz_id:4,report_type:"student_analysis",includes_all_versions:true,anonymous:false,generatable:true,
    updated_at:"2026-09-18T00:00:00Z",progress_url:state==="not_created"?null:origin+"/api/v1/progress/82",
    file:state==="ready"?{id:83,url:origin+"/files/83/download?verifier=fictional",size:4,updated_at:"2026-09-18T00:00:00Z"}:null});
  const fetchFn=vi.fn(async(url:string,init?:RequestInit)=>{
    expect(new URL(url).origin).toBe(origin);expect(init?.redirect).toBe("error");expect(init?.cache).toBe("no-store");
    expect(init?.headers).toMatchObject({Authorization:"Bearer fictional"});
    if(init?.method==="POST"){
      expect(url).toBe(origin+"/api/v1/courses/1/quizzes/4/reports");
      expect(JSON.parse(String(init.body))).toEqual({quiz_report:{report_type:"student_analysis",includes_all_versions:true}});
      if(state==="not_created")state="queued";
      return Response.json(report());
    }
    if(url.includes('/progress/'))return Response.json({workflow_state:state==="ready"?"completed":state});
    return Response.json([report()]);
  });
  return {options:{baseUrl:origin,apiToken:"fictional",fetchFn:fetchFn as unknown as typeof fetch},fetchFn};
}
it("requests all-attempt CSV once, then returns queued",async()=>{
  const {options,fetchFn}=fixture("not_created");
  expect(await prepareReport(options,1,4,origin,true)).toMatchObject({state:"queued",requestOutcome:"accepted",freshness:"unconfirmed"});
  expect(fetchFn.mock.calls.filter(([,init])=>init?.method==="POST")).toHaveLength(1);
});
it("labels an old file ready without asserting it was regenerated or fresh",async()=>{
  const {options,fetchFn}=fixture();const out=await prepareReport(options,1,4,origin,true);
  expect(out).toMatchObject({state:"ready",fileUpdatedAt:"2026-09-18T00:00:00Z",freshness:"unconfirmed",requestOutcome:"accepted"});
  expect(JSON.stringify(out)).not.toMatch(/verifier|download|Authorization/);
  expect(fetchFn.mock.calls.filter(([,init])=>init?.method==="POST")).toHaveLength(1);
});
it.each(["not_created","queued","running","ready","failed"])("status-only %s never posts",async state=>{
  const {options,fetchFn}=fixture(state);expect((await prepareReport(options,1,4,origin,false)).state).toBe(state);
  expect(fetchFn.mock.calls.every(([,init])=>init?.method==="GET")).toBe(true);
});
it.each(["queued","running"])("does not request again while %s",async state=>{
  const {options,fetchFn}=fixture(state);expect((await prepareReport(options,1,4,origin,true)).state).toBe(state);
  expect(fetchFn.mock.calls.filter(([,init])=>init?.method==="POST")).toHaveLength(0);
});
it("409 reads status and never retries the POST",async()=>{
  const {options}=fixture();const base=options.fetchFn;let posts=0;
  options.fetchFn=async(url,init)=>{if(init?.method==="POST"){posts++;return new Response('already running',{status:409});}return base(url,init);};
  expect(await prepareReport(options,1,4,origin,true)).toMatchObject({state:"ready",requestOutcome:"already_running"});expect(posts).toBe(1);
});
it.each(["network","429","500","wrong_quiz"])("%s after POST remains unknown and never retries",async failure=>{
  const {options}=fixture();const base=options.fetchFn;let posts=0;
  options.fetchFn=async(url,init)=>{
    if(init?.method==="POST") {posts++;if(failure==="network")throw new Error("PRIVATE URL TOKEN");
      return failure==="wrong_quiz"?Response.json({quiz_id:99}):new Response("PRIVATE ERROR",{status:Number(failure)});}
    return base(url,init);
  };
  const out=await prepareReport(options,1,4,origin,true);
  expect(out).toMatchObject({state:"unknown",requestOutcome:"unknown"});expect(posts).toBe(1);expect(JSON.stringify(out)).not.toContain("PRIVATE");
});
it("rejects wrong origin before any requests",async()=>{
  const {options,fetchFn}=fixture();await expect(prepareReport(options,1,4,'https://other.test',true)).rejects.toThrow();expect(fetchFn).not.toHaveBeenCalled();
});
it.each(['foreign_progress','foreign_file','anonymous','oversize','duplicate','invalid_json'])("rejects %s before sending a creation request",async mutation=>{
  const {options}=fixture();const base=options.fetchFn;let posts=0;
  options.fetchFn=async(url,init)=>{
    if(init?.method==="POST")posts++;
    const response=await base(url,init);if(String(url).includes('/progress/'))return response;
    if(mutation==='invalid_json')return new Response('{',{headers:{'content-type':'application/json'}});
    const rows=await response.json(),r=rows[0];
    if(mutation==='foreign_progress')r.progress_url='https://evil.test/api/v1/progress/82';
    if(mutation==='foreign_file')r.file.url='https://evil.test/files/83/download';
    if(mutation==='anonymous')r.anonymous=true;
    if(mutation==='oversize')r.file.size=1048577;
    if(mutation==='duplicate')rows.push({...r});
    return Response.json(rows);
  };
  await expect(prepareReport(options,1,4,origin,true)).rejects.toThrow();expect(posts).toBe(0);
});
it("bounds streamed metadata before requesting a job",async()=>{
  const {options}=fixture();options.fetchFn=async()=>new Response('x'.repeat(256*1024+1),{headers:{'content-type':'application/json','content-length':'1'}});
  await expect(prepareReport(options,1,4,origin,true)).rejects.toThrow();
});
it("completed progress without file is incomplete, not ready",async()=>{
  const {options}=fixture("completed");expect((await prepareReport(options,1,4,origin,false)).state).toBe("incomplete");
});
it("does not create while the previous generation state is incomplete or unknown",async()=>{
  for(const state of ['completed','unrecognized_state']) {
    const {options,fetchFn}=fixture(state);expect((await prepareReport(options,1,4,origin,true)).state).toBe('incomplete');
    expect(fetchFn.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
  }
});
