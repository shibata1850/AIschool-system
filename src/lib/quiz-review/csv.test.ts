import {describe,it,expect} from "vitest";
import catalog from "./catalog.json";
import {convertCanvasCsv,parseCsv,MAX_CSV_BYTES} from "./csv";
import {parseReview} from "./policy";
const policy={instance:"test-canvas",origin:"https://canvas.example.test",canvasCourseId:1};
export function csvFixture(attempt=1,userId=9001) {
  const q=catalog.questions.filter(q=>q.canvas_quiz_id===4);
  return [["name","id","sis_id","section","section_id","section_sis_id","submitted","attempt",
    ...q.flatMap(q=>[q.canvas_question_id+": 架空の設問",String(q.points)]),"n correct","n incorrect","score"],
    ["架空氏名",String(userId),"","架空セクション","1","","2026-09-19T00:00:00Z",String(attempt),
    ...q.flatMap(()=>["PRIVATE RESPONSE","1"]),"12","0","12"]].map(row=>row.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\r\n');
}
describe("bounded CSV conversion",()=>{
  it("retains scores and attempt, discards names and answers",()=>{
    const out=convertCanvasCsv(csvFixture(),4,policy),record=parseReview(out,policy)[0];
    expect(record).toMatchObject({canvasUserId:9001,quizId:4,attempt:1,earned:12});
    expect(JSON.stringify(out)).not.toMatch(/架空氏名|PRIVATE RESPONSE|架空セクション/);
  });
  it("handles BOM, quoted commas, Japanese multiline fields and escaped quotes",()=>{
    const text='\uFEFF"日本語,\r\n""引用""",x\r\ny,z\r\n';
    expect(parseCsv(text)).toEqual([['日本語,\r\n"引用"','x'],['y','z']]);
    expect(convertCanvasCsv('\uFEFF'+csvFixture(),4,policy).record_count).toBe(1);
  });
  it.each(['"unterminated','"x"junk,z','a"b,c','a,\0'])('rejects malformed CSV %s',text=>expect(()=>parseCsv(text)).toThrow());
  it("supports an empty report without inventing zero scores",()=>expect(convertCanvasCsv(csvFixture().split('\r\n')[0],4,policy).records).toEqual([]));
  it("keeps ungraded different from zero",()=>{
    const text=csvFixture().replace('"PRIVATE RESPONSE","1"','"PRIVATE RESPONSE",""');
    expect(parseReview(convertCanvasCsv(text,4,policy),policy)[0].earned).toBeNull();
    const zero=csvFixture().replaceAll('"PRIVATE RESPONSE","1"','"PRIVATE RESPONSE","0"').replace(/"12"$/,'"0"');
    expect(parseReview(convertCanvasCsv(zero,4,policy),policy)[0].earned).toBe(0);
  });
  it.each(['2','-1','NaN','1e0','0.1234567'])('rejects invalid question points %s',v=>expect(()=>convertCanvasCsv(csvFixture().replace('"PRIVATE RESPONSE","1"',`"PRIVATE RESPONSE","${v}"`),4,policy)).toThrow());
  it("rejects wrong quiz, catalog IDs, headers, total and duplicate attempts",()=>{
    const text=csvFixture(),line=text.split('\r\n')[1];
    for(const changed of [text.replace('"name"','"other"'),text.replace(/"\d+: /,'"99999: '),text.replace(/"12"$/,'"11"'),text+'\r\n'+line])
      expect(()=>convertCanvasCsv(changed,4,policy)).toThrow();
    expect(()=>convertCanvasCsv(text,3,policy)).toThrow();
  });
  it("retains two attempts separately and rejects excess rows/bytes",()=>{
    const text=csvFixture()+'\r\n'+csvFixture(2).split('\r\n')[1];
    expect(convertCanvasCsv(text,4,policy).records.map(r=>r.identity.attempt)).toEqual([1,2]);
    expect(()=>parseCsv('x'.repeat(MAX_CSV_BYTES+1))).toThrow();
    expect(()=>parseCsv(Array(102).fill('x').join('\n'))).toThrow();
    expect(()=>parseCsv(Array(212).fill('x').join(','))).toThrow();
  });
});
