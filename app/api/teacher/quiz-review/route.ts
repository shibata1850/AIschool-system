import { getCurrentUser } from "@/lib/auth";
import { getLtiConfig } from "@/lib/lti/config";
import { QuizReviewError } from "@/lib/quiz-review/policy";
import { listQuizReviews, requireReviewer, saveQuizReview } from "@/lib/quiz-review/service";

export const dynamic = "force-dynamic";
const headers = {"Cache-Control":"private, no-store"};
function failure(error: unknown) {
  return new Response(error instanceof QuizReviewError ? error.message : "確認用データを処理できませんでした", {
    status:error instanceof QuizReviewError ? error.status : 503, headers });
}
export async function GET() {
  try { return Response.json(await listQuizReviews(await getCurrentUser()), {headers}); }
  catch(error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const actor = await getCurrentUser();
    requireReviewer(actor);
    const tool = getLtiConfig()?.toolUrl;
    if (!tool || request.headers.get("origin") !== new URL(tool).origin) throw new QuizReviewError("送信元を確認できません",403);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
      return new Response("JSON形式で送信してください",{status:415,headers});
    }
    // Count actual bytes, not a caller-controlled Content-Length header.
    if (!request.body) throw new QuizReviewError("確認用JSONがありません");
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const {value,done} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 512 * 1024) { await reader.cancel(); throw new QuizReviewError("ファイルは512KB以内にしてください",413); }
      chunks.push(value);
    }
    let input: unknown;
    try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new QuizReviewError("JSONを読み取れません"); }
    return Response.json(await saveQuizReview(actor,input),{headers});
  } catch(error) { return failure(error); }
}
