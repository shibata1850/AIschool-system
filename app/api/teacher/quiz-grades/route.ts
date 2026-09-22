import {getCurrentUser} from '@/lib/auth';
import {getLtiConfig} from '@/lib/lti/config';
import {requireReviewer} from '@/lib/quiz-review/service';
import {decideFormalGrade,listFormalGrades} from '@/lib/quiz-review/formal-grades';
import {QuizReviewError} from '@/lib/quiz-review/policy';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
function failure(error:unknown){return new Response(error instanceof QuizReviewError?error.message:'成績を確認できません。再読み込みしてください',{
  status:error instanceof QuizReviewError?error.status:503,headers});}
export async function GET(){try{return Response.json(await listFormalGrades(await getCurrentUser()),{headers});}catch(e){return failure(e);}}
export async function POST(request:Request){
  try{
    const actor=await getCurrentUser();requireReviewer(actor);
    const tool=getLtiConfig()?.toolUrl;
    if(!tool||request.headers.get('origin')!==new URL(tool).origin)throw new QuizReviewError('送信元を確認できません',403);
    if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return new Response('JSON形式で送信してください',{status:415,headers});
    if(!request.body)throw new QuizReviewError('操作内容がありません');
    const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>2048){await reader.cancel();throw new QuizReviewError('操作内容が大きすぎます',413);}chunks.push(value);}
    let input:unknown;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new QuizReviewError('操作内容を読み取れません');}
    return Response.json(await decideFormalGrade(actor,input),{headers});
  }catch(e){return failure(e);}
}
