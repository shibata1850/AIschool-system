import {MAX_CSV_BYTES} from "./csv";
import {QuizReviewError} from "./policy";
import {isObject,positiveId} from "./verification";

export type PreparationState="not_created"|"queued"|"running"|"ready"|"failed"|"incomplete"|"unknown";
export type PreparationResult={state:PreparationState;checkedAt:string;fileUpdatedAt:string|null;
  requestOutcome:"not_requested"|"accepted"|"already_running"|"unknown";freshness:"unconfirmed";message:string};
const messages:Record<PreparationState,string>={
  not_created:"分析CSVは未作成です。「CSVの作成を依頼」を押してください。",
  queued:"Canvasで作成を受け付けました。順番待ちです。「準備状況を確認」で確認できます。",
  running:"Canvasで分析CSVを作成中です。「準備状況を確認」で確認できます。",
  ready:"分析CSVの準備ができています。以前のCSVが再利用される場合もあります。最新性は未確認です。取得して保存後、Canvasの答案と確認してください。",
  failed:"Canvasで分析CSVの作成に失敗しました。Canvasの分析画面とサーバーの処理状況を確認してください。",
  incomplete:"Canvasから準備完了を確認できません。「準備状況を確認」で再確認するか、Canvasの分析画面を確認してください。",
  unknown:"作成依頼の結果を確認できません。「準備状況を確認」を押してください。依頼は自動で再送していません。",
};

/** Only this operation may POST a report request. No DELETE, force regeneration or grade endpoints. */
export async function prepareReport(options:{baseUrl:string;apiToken:string;fetchFn:typeof fetch},courseId:number,quizId:number,
  expectedOrigin:string,requestCreation:boolean):Promise<PreparationResult> {
  const unavailable=()=>new QuizReviewError("分析CSVの準備状況を確認できません。Canvasの分析画面と接続設定を確認してください",503);
  let attempted=false;
  let outcome:PreparationResult["requestOutcome"]="not_requested";
  const result=(state:PreparationState,fileUpdatedAt:string|null=null):PreparationResult=>({state,fileUpdatedAt,
    checkedAt:new Date().toISOString(),requestOutcome:outcome,freshness:"unconfirmed",message:messages[state]});
  try {
    const origin=new URL(options.baseUrl).origin;
    if(!positiveId(courseId)||!positiveId(quizId)||origin!==expectedOrigin||options.baseUrl.replace(/\/$/,"")!==origin||
      !(origin.startsWith("https://")||/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)))throw unavailable();
    const base=`/api/v1/courses/${courseId}/quizzes/${quizId}/reports`;
    async function json(path:string,post=false):Promise<{status:number;value:unknown}> {
      const response=await options.fetchFn(origin+path,{method:post?"POST":"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(20000),
        headers:{Authorization:"Bearer "+options.apiToken,Accept:"application/json",...(post?{"Content-Type":"application/json"}:{})},
        ...(post?{body:JSON.stringify({quiz_report:{report_type:"student_analysis",includes_all_versions:true}})}:{})});
      if(post&&response.status===409){await response.body?.cancel();return {status:409,value:null};}
      if(!response.ok||!response.body||response.headers.get("content-type")?.split(";")[0].trim()!=="application/json")throw unavailable();
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
      for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
        if(bytes>256*1024){await reader.cancel();throw unavailable();}chunks.push(value);}
      return {status:response.status,value:JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)))};
    }
    const matches=(v:unknown)=>isObject(v)&&v.quiz_id===quizId&&v.report_type==="student_analysis"&&v.includes_all_versions===true;
    async function current() {
      const {value}=await json(base+"?includes_all_versions=true");
      if(!Array.isArray(value)||value.length>100)throw unavailable();
      const selected=value.filter(matches);if(selected.length>1)throw unavailable();
      return selected[0]??null;
    }
    async function inspect(value:unknown):Promise<PreparationResult> {
      if(value===null)return result("not_created");
      if(!isObject(value)||!matches(value)||value.anonymous!==false||value.generatable!==true)throw unavailable();
      let progress=value.progress;
      if(value.progress_url!=null){
        if(typeof value.progress_url!=="string")throw unavailable();const url=new URL(value.progress_url);
        if(url.origin!==origin||url.username||url.password||url.search||url.hash||!/^\/api\/v1\/progress\/[1-9]\d*$/.test(url.pathname))throw unavailable();
        progress=(await json(url.pathname)).value;
      }
      if(progress!=null) {
        if(!isObject(progress))throw unavailable();
        if(progress.workflow_state==="queued")return result("queued");
        if(progress.workflow_state==="running")return result("running");
        if(progress.workflow_state==="failed")return result("failed");
        if(progress.workflow_state!=="completed")return result("incomplete");
      }
      if(value.file==null)return result(progress==null?"not_created":"incomplete");
      const file=value.file;
      if(!positiveId(value.id)||!isObject(file)||!positiveId(file.id)||typeof file.url!=="string"||
        file.locked===true||file.locked_for_user===true||file.hidden===true||!Number.isSafeInteger(file.size)||
        (file.size as number)<0||(file.size as number)>MAX_CSV_BYTES||typeof file.updated_at!=="string"||!Number.isFinite(Date.parse(file.updated_at))||
        typeof value.updated_at!=="string"||!Number.isFinite(Date.parse(value.updated_at)))throw unavailable();
      const url=new URL(file.url);
      if(url.origin!==origin||url.username||url.password||url.hash||url.pathname!==`/files/${file.id}/download`)throw unavailable();
      return result("ready",file.updated_at);
    }
    const before=await inspect(await current());
    if(!requestCreation||before.state==="queued"||before.state==="running"||before.state==="incomplete")return before;
    attempted=true;
    const response=await json(base,true);
    if(response.status===409){outcome="already_running";return await inspect(await current());}
    outcome="accepted";
    if(!matches(response.value))throw unavailable();
    return await inspect(response.value);
  }catch(error){
    // A timeout can occur after Canvas accepted the POST. Never retry it automatically.
    if(attempted){outcome="unknown";return result("unknown");}
    if(error instanceof QuizReviewError)throw error;
    throw unavailable();
  }
}
