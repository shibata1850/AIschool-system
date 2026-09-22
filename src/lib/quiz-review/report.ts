import {createHash} from "node:crypto";
import {MAX_CSV_BYTES} from "./csv";
import {QuizReviewError} from "./policy";
import {isObject,positiveId} from "./verification";

export type ReportSource={kind:"canvas_report";reportId:number;fileId:number;reportUpdatedAt:string;
  fileUpdatedAt:string;fetchedAt:string;sha256:string;allAttempts:true;freshness:"unconfirmed"};
const unavailable=()=>new QuizReviewError("分析CSVを取得できませんでした。Canvasの分析画面と接続設定を確認してください",503);
const pending=()=>new QuizReviewError("取得できる分析CSVがありません。Canvasの分析画面で「すべての受験回」の受講者分析CSVを作成し、生成完了後に再度お試しください",409);
const changed=()=>new QuizReviewError("取得中に分析CSVが変更されました。時間をおいて再度お試しください",409);

/** GET only. No report generation, deletion, quiz submission or grade endpoints. */
export async function readExistingReport(options:{baseUrl:string;apiToken:string;fetchFn:typeof fetch},
  courseId:number,quizId:number,expectedOrigin:string):Promise<{csv:string;source:ReportSource}> {
  if(!positiveId(courseId)||!positiveId(quizId))throw unavailable();
  const origin=new URL(options.baseUrl).origin;
  if(origin!==expectedOrigin||options.baseUrl.replace(/\/$/,"")!==origin||
    !(origin.startsWith("https://")||/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)))throw unavailable();
  async function read(url:string,limit:number,csv=false) {
    // Signed query strings, response bodies and raw network errors must never reach logs/UI.
    try {
      const response=await options.fetchFn(url,{method:"GET",headers:{Authorization:"Bearer "+options.apiToken,Accept:csv?"text/csv":"application/json"},
        redirect:"error",cache:"no-store",signal:AbortSignal.timeout(20000)});
      if(!response.ok||!response.body)throw unavailable();
      const type=response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if(csv?type!=="text/csv":type!=="application/json")throw unavailable();
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
      for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
        if(size>limit){await reader.cancel();throw new QuizReviewError("分析データが取得上限を超えています",413);}chunks.push(value);}
      return new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(Buffer.concat(chunks));
    }catch(e){if(e instanceof QuizReviewError)throw e;throw unavailable();}
  }
  async function json(path:string):Promise<unknown>{try{return JSON.parse(await read(origin+path,256*1024));}catch(e){if(e instanceof QuizReviewError)throw e;throw unavailable();}}
  function report(value:unknown) {
    if(!isObject(value)||!positiveId(value.id)||value.quiz_id!==quizId||value.report_type!=="student_analysis"||
      value.includes_all_versions!==true||value.anonymous!==false||value.generatable!==true||!isObject(value.file))throw pending();
    const file=value.file;
    if(!positiveId(file.id)||typeof file.url!=="string"||file.locked===true||file.locked_for_user===true||file.hidden===true||
      !Number.isSafeInteger(file.size)||(file.size as number)<0||(file.size as number)>MAX_CSV_BYTES)throw pending();
    const url=new URL(file.url);
    if(url.origin!==origin||url.username||url.password||url.hash||url.pathname!==`/files/${file.id}/download`)throw unavailable();
    for(const stamp of [value.updated_at,file.updated_at])if(typeof stamp!=="string"||!Number.isFinite(Date.parse(stamp)))throw pending();
    return {id:value.id,fileId:file.id,url:url.href,updatedAt:value.updated_at as string,fileUpdatedAt:file.updated_at as string,
      size:file.size as number,progress:value.progress,progressUrl:value.progress_url};
  }
  async function ready(r:ReturnType<typeof report>){
    let progress=r.progress;
    if(r.progressUrl){
      if(typeof r.progressUrl!=="string")throw pending();const url=new URL(r.progressUrl);
      if(url.origin!==origin||url.username||url.password||url.search||url.hash||!/^\/api\/v1\/progress\/[1-9]\d*$/.test(url.pathname))throw unavailable();
      progress=await json(url.pathname);
    }
    if(progress!=null&&(!isObject(progress)||progress.workflow_state!=="completed"))throw pending();
  }
  try {
    const base=`/api/v1/courses/${courseId}/quizzes/${quizId}/reports`;
    const reports=await json(base+"?includes_all_versions=true");
    if(!Array.isArray(reports)||reports.length>100)throw unavailable();
    const selected=reports.filter(r=>isObject(r)&&r.quiz_id===quizId&&r.report_type==="student_analysis"&&r.includes_all_versions===true);
    if(selected.length!==1)throw pending();
    const first=report(selected[0]);await ready(first);
    const csv=await read(first.url,MAX_CSV_BYTES,true);
    const last=report(await json(base+"/"+first.id));await ready(last);
    if(first.id!==last.id||first.fileId!==last.fileId||first.updatedAt!==last.updatedAt||
      first.fileUpdatedAt!==last.fileUpdatedAt||first.size!==last.size||Buffer.byteLength(csv,"utf8")!==first.size)throw changed();
    return {csv,source:{kind:"canvas_report",reportId:first.id,fileId:first.fileId,reportUpdatedAt:first.updatedAt,
      fileUpdatedAt:first.fileUpdatedAt,fetchedAt:new Date().toISOString(),sha256:createHash("sha256").update(csv).digest("hex"),
      allAttempts:true,freshness:"unconfirmed"}};
  }catch(e){if(e instanceof QuizReviewError)throw e;throw unavailable();}
}
