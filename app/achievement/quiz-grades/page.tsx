import {getCurrentUser} from '@/lib/auth';
import {ownFormalGrades} from '@/lib/quiz-review/formal-grades';
import {QuizReviewError} from '@/lib/quiz-review/policy';
import {round1} from '@/lib/f4/achievement';
export const dynamic='force-dynamic';
export default async function QuizGradePage(){
  let rows:Awaited<ReturnType<typeof ownFormalGrades>>=[],error='';
  try{rows=await ownFormalGrades(await getCurrentUser());}catch(e){error=e instanceof QuizReviewError?e.message:'記録を確認できません。時間をおいて再読み込みしてください';}
  return <main style={{maxWidth:1000,margin:'auto',padding:16}}><h1>総合到達度に使う小テスト</h1>
    <p>講師が確認した最終小テストを100点満点に換算し、課題と同じ1件の重さで点数60％の計算に含めます。出席率・提出率の各20％は変えません。</p>
    <p>記録された授業週の集計に使います。「今の到達度」は最新の計測可能な週の値です。再受験・再採点は講師の確認後に置き換わります。</p>
    {error?<p role="alert">{error}</p>:!rows.length?<p>まだ採用記録はありません。</p>:rows.map(({token,snapshot:r,confirmedAt})=><section key={token} style={{border:'2px solid var(--fg-sub)',padding:16,margin:'16px 0'}}>
      <h2>最終小テスト {r.quizId}・受験{r.attempt}回目</h2>
      <p>{r.earned}/{r.possible}点 → {r.earned===null?'未採点':round1(r.earned/r.possible*100)}点（100点換算）</p>
      <p>対象授業週：{r.targetWeek} ／ {r.state==='adopted'?'総合到達度に採用中':'取り下げ済み・集計対象外'}</p>
      <p>講師確認日時：{confirmedAt.toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}（日本時間）</p>
    </section>)}
    <p><a href="/achievement">自分の到達度へ戻る</a></p></main>;
}
