import {describe,it,expect} from "vitest";
import {parseReview} from "./policy";
import {reviewFixture} from "./fixtures";
import converted from "./converter.fixture.json";
const policy={instance:"test-canvas",origin:"https://canvas.example.test",canvasCourseId:1};
describe("Canvas review parser",()=>{
  it("accepts a fictional document produced by the actual Python converter",()=>{
    const result=parseReview(converted,policy)[0];
    expect(result.earned).toBe(12);expect(result.skills).toHaveLength(4);
  });
  it("accepts all 45 registered quizzes and derives scores from catalog",()=>{
    for(let q=1;q<=45;q++) {
      const out=parseReview(reviewFixture(q),policy)[0];
      expect(out.earned).toBe(out.possible);
      expect(out.skills.length).toBeGreaterThan(0);
    }
  });
  it("discards supplied identity keys, names, summaries, grades and reasons",()=>{
    const input=reviewFixture();
    Object.assign(input.records[0],{source_record_key:"PRIVATE",name:"PRIVATE",skills:["PRIVATE"],receiver_student_id:"PRIVATE"});
    expect(JSON.stringify(parseReview(input,policy))).not.toContain("PRIVATE");
  });
  it("same answer resends keep identity and regrades keep both revisions",()=>{
    const input=reviewFixture(), a=parseReview(input,policy)[0];
    expect(parseReview(input,policy)[0]).toEqual(a);
    input.records[0].scores["STEP01/F01"]=0; input.records[0].total.reported=11;
    const b=parseReview(input,policy)[0];expect(b.sourceKey).toBe(a.sourceKey);expect(b.revision).not.toBe(a.revision);
    expect(parseReview(reviewFixture(4,9001,2),policy)[0].sourceKey).not.toBe(a.sourceKey);
  });
  it("missing scores are distinct from zero",()=>{
    const x=reviewFixture();x.records[0].scores["STEP01/F01"]=null;
    expect(parseReview(x,policy)[0].earned).toBeNull();
    expect(parseReview(x,policy)[0].skills.some(s=>s.earned===null)).toBe(true);
    x.records[0].scores["STEP01/F01"]=0;x.records[0].total.reported=11;
    expect(parseReview(x,policy)[0].earned).toBe(11);
  });
  it("empty export is no submission, not a zero grade",()=>{
    const x=reviewFixture();x.records=[];x.record_count=0;expect(parseReview(x,policy)).toEqual([]);
  });
  it("preserves six-place decimals using integer totals",()=>{
    const x=reviewFixture();x.records[0].scores["STEP01/F01"]=0.123456;x.records[0].total.reported=11.123456;
    expect(parseReview(x,policy)[0].earned).toBe(11.123456);
  });
  it("rejects invalid score and sum, missing and foreign questions, wrong catalog",()=>{
    const changes=[(x:any)=>x.records[0].scores["STEP01/F01"]=true,(x:any)=>x.records[0].scores["STEP01/F01"]=-1,
      (x:any)=>x.records[0].scores["STEP01/F01"]=2,(x:any)=>x.records[0].scores["STEP01/F01"]=NaN,
      (x:any)=>x.records[0].scores["STEP01/F01"]=0.1234567,(x:any)=>x.records[0].total.reported=11,
      (x:any)=>delete x.records[0].scores["STEP01/F01"],(x:any)=>x.records[0].scores.other=1,
      (x:any)=>x.records[0].catalog_fingerprint="bad"];
    for(const change of changes){const x=reviewFixture();change(x);expect(()=>parseReview(x,policy)).toThrow();}
  });
  it("rejects wrong system, origin, course, user, stage, attempt and duplicate answers",()=>{
    const changes=[(x:any)=>x.source_instance="other",(x:any)=>x.source_origin="https://wrong.test",
      (x:any)=>x.course_id=2,(x:any)=>x.records[0].identity.canvas_course_id=2,
      (x:any)=>x.records[0].identity.canvas_user_id=true,(x:any)=>x.records[0].identity.attempt=0,
      (x:any)=>x.records[0].identity.stage="R",(x:any)=>x.records[0].identity.step="STEP02",
      (x:any)=>{x.records.push(x.records[0]);x.record_count=2;}];
    for(const change of changes){const x=reviewFixture();change(x);expect(()=>parseReview(x,policy)).toThrow();}
  });
  it("limits batches and does not mutate input",()=>{
    const x=reviewFixture(), before=structuredClone(x);parseReview(x,policy);expect(x).toEqual(before);
    x.records=Array(101).fill(x.records[0]);x.record_count=101;expect(()=>parseReview(x,policy)).toThrow();
  });
});
