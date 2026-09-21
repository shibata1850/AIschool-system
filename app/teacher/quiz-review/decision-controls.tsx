"use client";
import {useId,useState} from 'react';
import type {DecisionView} from '@/lib/quiz-review/decision-policy';
export default function DecisionControls({sourceKey,revision,graded,decision,refresh,disabled}:{sourceKey:string;revision:string;graded:boolean;decision:DecisionView|null;refresh:()=>Promise<void>;disabled:boolean}){
  const id=useId(),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const selected=decision?.sourceKey===sourceKey&&decision?.revision===revision;
  const adopted=selected&&decision?.state==='adopted';
  async function decide(action:'adopt'|'withdraw'){
    if(busy)return;setBusy(true);setMessage('採用状態を保存しています');
    try{
      const response=await fetch('/api/teacher/quiz-review/decision',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({sourceKey,revision,action,expectedToken:decision?.token??null,confirmed})});
      if(!response.ok)throw new Error(await response.text());
      setConfirmed(false);await refresh();setMessage(action==='adopt'?'本人表示用に採用しました':'本人表示を取り下げました');
    }catch(error){setMessage(error instanceof Error?error.message:'結果を確認できません。再読み込みしてください');}
    finally{setBusy(false);}
  }
  return <div>
    <p>{adopted?'講師確認済み・本人表示中':selected&&decision?.state==='withdrawn'?'取り下げ済み':'未採用'}{selected&&decision&&<> · 操作日時：{new Date(decision.decidedAt).toLocaleString('ja-JP')}</>}</p>
    {!adopted&&<>
      <label htmlFor={id} style={{display:'flex',gap:12,alignItems:'center',minHeight:44}}>
        <input id={id} type="checkbox" checked={confirmed} disabled={disabled||busy||!graded} onChange={e=>setConfirmed(e.target.checked)} style={{width:24,height:24}} />
        Canvasの答案で受講者・受験回・各設問の得点を確認しました
      </label>
      <p>同じ小テストで採用中の結果があれば、この結果に置き換わります。最新の受験回とは限らないため、採用する回を確認してください。</p>
      <button disabled={disabled||busy||!graded||!confirmed} onClick={()=>decide('adopt')} style={{minHeight:44,padding:12}}>この結果を本人表示に採用</button>
      {!graded&&<p>未採点があるため採用できません。</p>}
    </>}
    {adopted&&<button disabled={disabled||busy} onClick={()=>decide('withdraw')} style={{minHeight:44,padding:12}}>本人表示を取り下げる</button>}
    <p aria-live="polite">{message}</p>
  </div>;
}
