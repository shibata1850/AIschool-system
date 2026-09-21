import {getCurrentUser} from '@/lib/auth';
import {ownQuizResults} from '@/lib/quiz-review/decisions';
import {QuizReviewError} from '@/lib/quiz-review/policy';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){
  try{
    if(new URL(request.url).search)throw new QuizReviewError('受講者やコースを指定して取得することはできません');
    return Response.json(await ownQuizResults(await getCurrentUser()),{headers});
  }catch(error){return new Response(error instanceof QuizReviewError?error.message:'小テスト記録を確認できませんでした',{
    status:error instanceof QuizReviewError?error.status:503,headers});}
}
