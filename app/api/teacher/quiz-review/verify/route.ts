import {getCurrentUser} from "@/lib/auth";
import {QuizReviewError} from "@/lib/quiz-review/policy";
import {verifyQuizReview} from "@/lib/quiz-review/service";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
export async function GET(request:Request) {
  try {
    const query=new URL(request.url).searchParams;
    const result=await verifyQuizReview(await getCurrentUser(),query.get("sourceKey")??"",query.get("revision")??"");
    return Response.json(result,{headers});
  } catch(error) {
    return new Response(error instanceof QuizReviewError?error.message:"照合できませんでした。時間をおいて再試行してください",{
      status:error instanceof QuizReviewError?error.status:503,headers});
  }
}
