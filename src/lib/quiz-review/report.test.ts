import {it,expect,vi} from "vitest";
import {readExistingReport} from "./report";
const origin="https://canvas.example.test";
function fixture(mutator?:(r:Record<string,any>)=>void) {
  const report={id:81,quiz_id:4,report_type:"student_analysis",includes_all_versions:true,anonymous:false,generatable:true,
    updated_at:"2026-09-18T00:00:00Z",progress_url:origin+"/api/v1/progress/82",
    file:{id:83,url:origin+"/files/83/download?verifier=fictional",size:4,updated_at:"2026-09-18T00:00:00Z",locked:false}};
  mutator?.(report);
  const fetchFn=vi.fn(async(url:string,init?:RequestInit)=>{
    expect(init?.method).toBe("GET");expect(init?.redirect).toBe("error");expect(new URL(url).origin).toBe(origin);
    const path=new URL(url).pathname;
    if(path==="/files/83/download")return new Response('\uFEFFx',{headers:{'content-type':'text/csv'}});
    const value=path.endsWith('/reports')?[report]:path.endsWith('/82')?{workflow_state:'completed'}:report;
    return Response.json(value);
  }) as unknown as typeof fetch;
  return {report,fetchFn,options:{baseUrl:origin,apiToken:'fictional',fetchFn}};
}
it("reads existing all-attempt CSV, rechecks report and keeps only safe provenance",async()=>{
  const {options,fetchFn}=fixture(),out=await readExistingReport(options,1,4,origin);
  expect(out.csv).toBe('\uFEFFx');expect(out.source).toMatchObject({kind:'canvas_report',allAttempts:true,freshness:'unconfirmed',fileId:83});
  expect(out.source.sha256).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(out.source)).not.toContain('verifier');
  expect(fetchFn).toHaveBeenCalledTimes(5);
});
it.each([
  (r:any)=>r.file.url='https://evil.test/files/83/download',
  (r:any)=>r.file.url=origin+'/api/v1/users',
  (r:any)=>r.file.url=origin+'/files/84/download',
  (r:any)=>r.progress_url='https://evil.test/api/v1/progress/82',
  (r:any)=>r.file.locked=true,
  (r:any)=>r.anonymous=true,
  (r:any)=>r.file.size=1048577,
  (r:any)=>r.includes_all_versions=false,
  (r:any)=>r.file.updated_at='invalid',
  (r:any)=>delete r.file,
])("rejects unsafe or incomplete report metadata",async mutate=>{
  const {options,fetchFn}=fixture(mutate);await expect(readExistingReport(options,1,4,origin)).rejects.toThrow();
  expect((fetchFn as ReturnType<typeof vi.fn>).mock.calls.some(([url])=>String(url).includes('/files/'))).toBe(false);
});
it("rejects origin configuration mismatch before any request",async()=>{
  const {options,fetchFn}=fixture();await expect(readExistingReport(options,1,4,'https://other.test')).rejects.toThrow();expect(fetchFn).not.toHaveBeenCalled();
});
it("rejects report replacement during download",async()=>{
  const {options,report}=fixture(),base=options.fetchFn;
  options.fetchFn=async(url,init)=>{const res=await base(url,init);if(String(url).includes('/files/'))report.file.updated_at='2026-09-19T00:00:00Z';return res;};
  await expect(readExistingReport(options,1,4,origin)).rejects.toThrow('変更');
});
it.each(['queued','running','failed'])("rejects %s progress",async state=>{
  const {options}=fixture(),base=options.fetchFn;
  options.fetchFn=async(url,init)=>String(url).includes('/progress/')?Response.json({workflow_state:state}):base(url,init);
  await expect(readExistingReport(options,1,4,origin)).rejects.toThrow('生成完了');
});
it("rejects HTML login response and sanitizes network exceptions",async()=>{
  for(const failure of ['html','exception']) {
    const {options}=fixture(),base=options.fetchFn;
    options.fetchFn=async(url,init)=>{if(String(url).includes('/files/')){if(failure==='exception')throw Error('SECRET URL');return new Response('private',{headers:{'content-type':'text/html'}});}return base(url,init);};
    await expect(readExistingReport(options,1,4,origin)).rejects.toThrow('取得できません');
  }
});
it("bounds actual streamed bytes without trusting Content-Length",async()=>{
  const {options}=fixture(),base=options.fetchFn;
  options.fetchFn=async(url,init)=>String(url).includes('/files/')?new Response('x'.repeat(1048577),{headers:{'content-type':'text/csv','content-length':'1'}}):base(url,init);
  await expect(readExistingReport(options,1,4,origin)).rejects.toThrow('上限');
});
