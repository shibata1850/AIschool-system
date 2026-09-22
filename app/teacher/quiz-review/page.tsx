import { getCurrentUser } from "@/lib/auth";
import { requireReviewer } from "@/lib/quiz-review/service";
import ReviewForm from "./review-form";
import catalog from "@/lib/quiz-review/catalog.json";
export const dynamic = "force-dynamic";
export default async function QuizReviewPage() {
  try { requireReviewer(await getCurrentUser()); }
  catch { return <main><h1>小テスト結果の確認</h1><p>Canvasのコースから担当講師として起動してください。</p></main>; }
  return <main style={{maxWidth:1100,margin:"auto",padding:"1rem"}}>
    <h1>小テスト結果の確認</h1>
    <p>Canvasの分析CSVを取得して確認待ちで保存します。講師が答案を確認して採用すると、本人の小テスト記録に表示されます。</p>
    <p>正式な成績はCanvasで確認してください。確認用データの表示期間は保存から30日です。</p>
    <ReviewForm achievementEnabled={process.env.QUIZ_ACHIEVEMENT_ENABLED==='true'} publicationEnabled={process.env.QUIZ_REVIEW_PUBLICATION_ENABLED==='true'} quizzes={[...new Map(catalog.questions.map(q=>[q.canvas_quiz_id,{id:q.canvas_quiz_id,step:q.step,stage:q.stage}])).values()]} />
    <p><a href="/">ホームへ戻る</a></p>
  </main>;
}
