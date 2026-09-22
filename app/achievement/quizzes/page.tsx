import {getCurrentUser} from '@/lib/auth';
import {ownQuizResults} from '@/lib/quiz-review/decisions';
import {QuizReviewError} from '@/lib/quiz-review/policy';
import {skillLabels} from '@/lib/quiz-review/labels';
export const dynamic='force-dynamic';
const stages:Record<string,string>={D:'事前診断',A:'途中確認A',B:'途中確認B',F:'最終テスト',R:'復習'};
export default async function QuizResultsPage(){
  let results:Awaited<ReturnType<typeof ownQuizResults>>=[],error='';
  try{results=await ownQuizResults(await getCurrentUser());}
  catch(e){error=e instanceof QuizReviewError?e.message:'小テスト記録を確認できません。時間をおいて再読み込みしてください';}
  return <main style={{maxWidth:1000,margin:'auto',padding:'1rem'}}>
    <h1>講師確認済みの小テスト記録</h1>
    <p>講師がCanvasの答案を確認して選んだ結果です。受験回と確認日時を見ながら復習に使ってください。採用後の再受験・再採点は自動反映されません。</p>
    <p>この確認用記録は元データの保存から30日間表示されます。元の答案・成績はCanvasで確認できます。この画面への掲載だけでは総合到達度に加算されません。</p>
    {process.env.QUIZ_ACHIEVEMENT_ENABLED==='true'&&<p><a href="/achievement/quiz-grades">別途採用された最終小テストと総合到達度の計算根拠を見る</a></p>}
    {error?<p role="alert">{error}</p>:results.length===0?<p>現在、表示できる講師確認済みの結果はありません。</p>:results.map(r=><section key={r.step+'/'+r.stage} aria-label={`${r.step} ${stages[r.stage]}`} style={{border:'2px solid var(--fg-sub)',borderRadius:8,padding:'1rem',margin:'1rem 0'}}>
      <h2>{r.step} · {stages[r.stage]} · 受験{r.attempt}回目</h2>
      <p>合計：{r.earned} / {r.possible}点</p>
      <ul>{r.skills.map(s=><li key={s.key}>{skillLabels[s.key.split('/')[1]]??'技能'}：{s.earned} / {s.possible}点</li>)}</ul>
      <p>講師確認日時：{new Date(r.decidedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}（日本時間）</p>
      <p>表示期限：{new Date(r.expiresAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}（日本時間）</p>
    </section>)}
    <p><a href="/achievement">自分の到達度へ戻る</a></p>
  </main>;
}
