"use client";
import {useEffect,useId,useState} from 'react';
import type {ReviewRecord} from '@/lib/quiz-review/policy';
import type {FormalQuizGrade} from '@/lib/quiz-review/achievement-records';
type Grade={token:string;snapshot:FormalQuizGrade;confirmedAt:string};
export default function FormalControls({candidates}:{candidates:ReviewRecord[]}){
  const id=useId();const [grades,setGrades]=useState<Grade[]>([]),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [selection,setSelection]=useState(''),[week,setWeek]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [withdrawToken,setWithdrawToken]=useState('');
  async function refresh(){const r=await fetch('/api/teacher/quiz-grades',{cache:'no-store'});if(!r.ok)throw Error(await r.text());setGrades(await r.json());setReady(true);}
  useEffect(()=>{let active=true;fetch('/api/teacher/quiz-grades',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error(await r.text());return r.json();}).then(g=>{if(active){setGrades(g);setReady(true);}}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[]);
  const eligible=candidates.filter(r=>r.stage==='F'&&r.earned!==null);
  async function send(input:object){if(busy)return;setBusy(true);setMessage('Canvasの答案を確認しています');try{
    const r=await fetch('/api/teacher/quiz-grades',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
    if(!r.ok)throw Error(await r.text());setConfirmed(false);setWithdrawToken('');await refresh();setMessage('総合到達度用の採用状態を保存しました');
  }catch(e){setReady(false);setMessage(e instanceof Error?e.message:'再読み込みしてください');}finally{setBusy(false);}}
  function adopt(){const r=eligible.find(r=>r.sourceKey+':'+r.revision===selection);if(!r)return;
    const current=grades.find(g=>g.snapshot.quizId===r.quizId&&g.snapshot.canvasUserId===r.canvasUserId);
    return send({action:'adopt',sourceKey:r.sourceKey,revision:r.revision,targetWeek:week,expectedToken:current?.token??null,confirmed});}
  return <section aria-label="総合到達度への反映" style={{border:'2px solid var(--accent)',padding:16,margin:'16px 0'}}>
    <h2>総合到達度への反映</h2>
    <p>最終小テストを課題と同じ重さで点数60％に含めます。出席率・提出率は変えません。採用済みの結果があれば置き換えます。</p>
    <label htmlFor={id+'result'}>反映する最終テスト</label>
    <select id={id+'result'} value={selection} disabled={busy||!ready} onChange={e=>{setSelection(e.target.value);setConfirmed(false);}} style={{display:'block',minHeight:44,maxWidth:'100%'}}>
      <option value="">結果を選択</option>{eligible.map(r=><option key={r.sourceKey+':'+r.revision} value={r.sourceKey+':'+r.revision}>{r.step}・受講者番号{r.canvasUserId}・受験{r.attempt}回目・{r.earned}/{r.possible}点</option>)}
    </select>
    <label htmlFor={id+'week'}>対象授業週の月曜日</label><input id={id+'week'} type="date" value={week} onChange={e=>setWeek(e.target.value)} disabled={busy} style={{display:'block',minHeight:44}} />
    <label style={{display:'flex',alignItems:'center',minHeight:44,gap:12}}><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={busy} />受講者・受験回・授業週を確認しました</label>
    <button disabled={busy||!ready||!selection||!week||!confirmed} onClick={adopt} style={{minHeight:44}}>総合到達度に採用する</button>
    <p role="status">{message}</p>
    {!ready&&<button disabled={busy} onClick={()=>refresh().then(()=>setMessage('一覧を更新しました')).catch(()=>setMessage('一覧を取得できません。時間をおいて再読み込みしてください'))} style={{minHeight:44}}>採用記録を再読み込みする</button>}
    <h3>現在の採用記録</h3><p>確認用コピーの30日期限後もこの記録は残ります。再受験・再採点は自動反映されません。</p>
    {grades.map(g=><div key={g.token} style={{padding:'12px 0'}}>
      <p>受講者番号{g.snapshot.canvasUserId??'未登録'}・小テスト{g.snapshot.quizId}・受験{g.snapshot.attempt}回目：{g.snapshot.earned}/{g.snapshot.possible}点／対象週 {g.snapshot.targetWeek}／{g.snapshot.state==='adopted'?'採用中':'取り下げ済み'}</p>
      {g.snapshot.state==='adopted'&&<>
        <label style={{display:'flex',alignItems:'center',minHeight:44,gap:12}}><input type="checkbox" disabled={busy} checked={withdrawToken===g.token} onChange={e=>setWithdrawToken(e.target.checked?g.token:'')} />受講者番号{g.snapshot.canvasUserId}の小テスト{g.snapshot.quizId}を取り下げることを確認しました</label>
        <button disabled={busy||!ready||withdrawToken!==g.token} onClick={()=>send({action:'withdraw',expectedToken:g.token,confirmed:withdrawToken===g.token})} style={{minHeight:44}}>この成績を総合到達度から取り下げる</button>
      </>}
    </div>)}
  </section>;
}
