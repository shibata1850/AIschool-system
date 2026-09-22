import {getCurrentUser} from "@/lib/auth";
import {getLtiConfig} from "@/lib/lti/config";
import {QuizReviewError} from "@/lib/quiz-review/policy";
import {prepareQuizReport,requireReviewer} from "@/lib/quiz-review/service";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
function failure(error:unknown){return new Response(error instanceof QuizReviewError?error.message:"準備状況を確認できませんでした",{
  status:error instanceof QuizReviewError?error.status:503,headers});}
export async function GET(request:Request){
  try {
    const actor=await getCurrentUser();requireReviewer(actor);
    const query=new URL(request.url).searchParams;
    if([...query.keys()].join(",")!=="quizId"||!/^\d{1,10}$/.test(query.get("quizId")??""))throw new QuizReviewError("小テストを選び直してください");
    return Response.json(await prepareQuizReport(actor,Number(query.get("quizId")),false),{headers});
  }catch(error){return failure(error);}
}
export async function POST(request:Request){
  try {
    const actor=await getCurrentUser();requireReviewer(actor);
    const tool=getLtiConfig()?.toolUrl;
    if(!tool||request.headers.get("origin")!==new URL(tool).origin)throw new QuizReviewError("送信元を確認できません",403);
    if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")return new Response("JSON形式で送信してください",{status:415,headers});
    if(!request.body)throw new QuizReviewError("小テストを選んでください");
    const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>128){await reader.cancel();throw new QuizReviewError("入力が長すぎます",413);}chunks.push(value);}
    let input;
    try{input=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new QuizReviewError("小テストを選び直してください");}
    if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).join(",")!=="quizId")throw new QuizReviewError("小テストを選び直してください");
    return Response.json(await prepareQuizReport(actor,input.quizId,true),{headers});
  }catch(error){return failure(error);}
}
