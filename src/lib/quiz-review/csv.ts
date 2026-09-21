import catalog from "./catalog.json";
import {hash, parseReview, QuizReviewError, type ReviewPolicy} from "./policy";

export const MAX_CSV_BYTES = 1024 * 1024;
const fail = (): never => {throw new QuizReviewError("分析CSVの設問・得点・受験回を確認できません。Canvasで再出力してください",409);};

/** Bounded RFC-style CSV parser. Quoted newlines and doubled quotes are allowed. */
export function parseCsv(text:string):string[][] {
  if(Buffer.byteLength(text,"utf8")>MAX_CSV_BYTES) throw new QuizReviewError("分析CSVは1MB以内・100答案以内が対象です",413);
  text=text.replace(/^\uFEFF/,"");
  if(text.includes("\0")) return fail();
  const rows:string[][]=[];let row:string[]=[],field="",state:"start"|"plain"|"quoted"|"closed"="start";
  const cell=()=>{row.push(field);field="";state="start";if(row.length>211) fail();};
  const line=()=>{cell();if(row.some(v=>v!=="")) rows.push(row);row=[];if(rows.length>101) throw new QuizReviewError("分析CSVは1MB以内・100答案以内が対象です",413);};
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(state==="quoted") {
      if(c==='"') {if(text[i+1]==='"'){field+='"';i++;}else state="closed";}else field+=c;
      continue;
    }
    if(c===","){cell();continue;}
    if(c==="\r"||c==="\n"){if(c==="\r"&&text[i+1]==="\n")i++;line();continue;}
    if(state==="closed") return fail();
    if(c==='"'){if(state!=="start")return fail();state="quoted";}
    else {state="plain";field+=c;}
  }
  if(state==="quoted")return fail();
  if(row.length||field!==""||state!=="start")line();
  return rows;
}

/** Discard names, response text and section information before anything is stored. */
export function convertCanvasCsv(text:string,quizId:number,policy:ReviewPolicy) {
  const questions=catalog.questions.filter(q=>q.canvas_course_id===policy.canvasCourseId&&q.canvas_quiz_id===quizId)
    .sort((a,b)=>a.question_key.localeCompare(b.question_key));
  if(!questions.length) return fail();
  const rows=parseCsv(text),header=rows.shift();
  const prefix=["name","id","sis_id","section","section_id","section_sis_id","submitted","attempt"];
  if(!header||header.length!==11+questions.length*2||prefix.some((s,i)=>header[i]!==s)||
    ["n correct","n incorrect","score"].some((s,i)=>header[header.length-3+i]!==s))return fail();
  const decimal=(value:string):number=>{if(!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value))return fail();const n=Number(value);if(!Number.isFinite(n))return fail();return n;};
  const id=(value:string):number=>{if(!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value)))return fail();return Number(value);};
  const columns=new Map<string,number>();
  for(let i=8;i<header.length-3;i+=2) {
    const match=/^([1-9]\d*):\s*(.+)$/s.exec(header[i]);
    const q=match&&questions.find(q=>q.canvas_question_id===id(match[1]));
    if(!q||columns.has(q.question_key)||decimal(header[i+1])!==q.points)return fail();
    columns.set(q.question_key,i+1);
  }
  const input={schema:"ngas.canvas-csv-review.v1",source_instance:policy.instance,source_origin:policy.origin,
    course_id:policy.canvasCourseId,quiz_id:quizId,record_count:rows.length,
    records:rows.map(row=>{
      if(row.length!==header.length||!row[6].trim())return fail();
      return {identity:{source_instance:policy.instance,canvas_course_id:policy.canvasCourseId,canvas_quiz_id:quizId,
        canvas_user_id:id(row[1]),attempt:id(row[7]),step:questions[0].step,stage:questions[0].stage},
        catalog_fingerprint:hash(questions),scores:Object.fromEntries(questions.map(q=>{
          const value=row[columns.get(q.question_key)!];return [q.question_key,value===""?null:decimal(value)];
        })),total:{reported:decimal(row[row.length-1])}};
    })};
  try {parseReview(input,policy);}catch {return fail();}
  return input;
}
