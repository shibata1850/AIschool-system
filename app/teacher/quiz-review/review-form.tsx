"use client";
import { useEffect, useState } from "react";
import type { ReviewRecord } from "@/lib/quiz-review/policy";
import {skillLabels} from "@/lib/quiz-review/labels";
import VerificationButton from "./verification-button";
import type {PreparationResult} from "@/lib/quiz-review/preparation";
import DecisionControls from './decision-controls';
import type {DecisionView} from '@/lib/quiz-review/decision-policy';
import FormalControls from './formal-controls';
type Row = {snapshot:ReviewRecord; importedAt:string;expiresAt:string;decision:DecisionView|null};
const stages:Record<string,string> = {D:"事前診断",A:"途中確認A",B:"途中確認B",F:"最終テスト",R:"復習"};
export default function ReviewForm({quizzes,publicationEnabled,achievementEnabled=false}:{quizzes:{id:number;step:string;stage:string}[];publicationEnabled:boolean;achievementEnabled?:boolean}) {
  const [quizId,setQuizId]=useState("");
  const [preparation,setPreparation]=useState<PreparationResult|null>(null),[requestUncertain,setRequestUncertain]=useState(false);
  const [rows,setRows] = useState<Row[]>([]), [message,setMessage] = useState("読み込み中です"),
    [busy,setBusy] = useState(false), [file,setFile] = useState<File|null>(null);
  async function refresh(signal?: AbortSignal) {
    const response = await fetch("/api/teacher/quiz-review",{cache:"no-store",signal});
    if (!response.ok) throw new Error(await response.text());
    setRows(await response.json());
  }
  useEffect(() => {
    const control = new AbortController();
    refresh(control.signal).then(()=>setMessage("")).catch(e=> {if (!control.signal.aborted) setMessage(e instanceof Error? e.message:"読み込みに失敗しました");});
    return () => control.abort();
  },[]);
  async function save() {
    if (!file || busy) return;
    if (file.size > 512*1024) {setMessage("ファイルは512KB以内にしてください");return;}
    setBusy(true);setMessage("確認用データを保存しています");
    try {
      const response = await fetch("/api/teacher/quiz-review",{method:"POST",headers:{"content-type":"application/json"},body:await file.text()});
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      const saved = `確認待ちとして${result.created}件保存しました。同じ内容の再送は${result.duplicates}件でした。`;
      try {await refresh();setMessage(saved);}
      catch {setMessage(saved+" 一覧の更新に失敗したため、再読み込みしてください。");}
    } catch(e) {setMessage(e instanceof Error? e.message:"結果を確認できません。再読み込みしてください");}
    finally {setBusy(false);}
  }
  async function acquire() {
    if(!quizId||busy)return;
    setBusy(true);setMessage("Canvasの分析CSVを取得して検査しています");
    try {
      const response=await fetch("/api/teacher/quiz-review/acquire",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({quizId:Number(quizId)})});
      if(!response.ok)throw new Error(await response.text());
      const result=await response.json();
      const saved=`分析CSVから${result.created}件を確認待ちで保存しました。同じ内容は${result.duplicates}件でした。CSVファイル更新日時：${new Date(result.source.fileUpdatedAt).toLocaleString("ja-JP")}。最新性は未確認です。`;
      try{await refresh();setMessage(saved);}catch{setMessage(saved+" 一覧を再読み込みしてください。");}
    }catch(e){setMessage(e instanceof Error?e.message:"分析CSVを取得できませんでした");}
    finally{setBusy(false);}
  }
  async function prepare(requestCreation:boolean) {
    if(!quizId||busy)return;
    setBusy(true);setMessage(requestCreation?"CanvasへCSVの作成を依頼しています":"分析CSVの準備状況を確認しています");
    if(requestCreation)setRequestUncertain(true);
    try {
      const response=await fetch("/api/teacher/quiz-review/prepare"+(requestCreation?"":"?quizId="+quizId),requestCreation?
        {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({quizId:Number(quizId)})}:{cache:"no-store"});
      if(!response.ok)throw new Error(await response.text());
      const result:PreparationResult=await response.json();setPreparation(result);setRequestUncertain(result.state==="unknown");setMessage(result.message);
    }catch(e){setMessage(e instanceof Error?e.message:"準備状況を確認できませんでした");}
    finally{setBusy(false);}
  }
  return <>
    <h2>Canvasから取得</h2>
    <p>小テストを選び、CSVの作成を依頼します。準備状況を確認し、完了したら取得して保存します。新しい答案や再採点が反映済みかは、Canvasで確認してください。100答案・1MB以内が対象です。</p>
    <label htmlFor="report-quiz">取得する小テスト</label>{" "}
    <select id="report-quiz" value={quizId} disabled={busy} onChange={e=>{setQuizId(e.target.value);setPreparation(null);setRequestUncertain(false);setMessage("");}} style={{minHeight:44,maxWidth:"100%",marginBottom:12}}>
      <option value="">小テストを選択</option>
      {quizzes.map(q=><option key={q.id} value={q.id}>{q.step} · {stages[q.stage]}</option>)}
    </select>{" "}
    <div style={{display:"flex",flexWrap:"wrap",gap:12}}>
      <button disabled={!quizId||busy||requestUncertain||preparation?.state==="queued"||preparation?.state==="running"||preparation?.state==="incomplete"} onClick={()=>prepare(true)} style={{minHeight:44,padding:".7rem 1.2rem"}}>CSVの作成を依頼</button>
      <button disabled={!quizId||busy} onClick={()=>prepare(false)} style={{minHeight:44,padding:".7rem 1.2rem"}}>準備状況を確認</button>
      <button disabled={!quizId||busy||requestUncertain||(preparation!==null&&preparation.state!=="ready")} onClick={acquire} style={{minHeight:44,padding:".7rem 1.2rem"}}>分析CSVを取得して保存</button>
    </div>
    <p>作成依頼では「すべての受験回」を対象にします。Canvasの判断で以前のCSVが再利用されることがあります。準備完了は、最新の得点を確認済みという意味ではありません。</p>
    {preparation&&<p>状況確認日時：{new Date(preparation.checkedAt).toLocaleString("ja-JP")}{preparation.fileUpdatedAt&&<> · CSVファイル更新日時：{new Date(preparation.fileUpdatedAt).toLocaleString("ja-JP")}</>}</p>}
    <h2>変換済みファイルから保存</h2>
    <label htmlFor="review-file">確認用JSON（512KB以内）</label>
    <input id="review-file" type="file" accept="application/json,.json" disabled={busy}
      onChange={e=>setFile(e.target.files?.[0]??null)} style={{display:"block",maxWidth:"100%",padding:"12px 0"}} />
    <button disabled={!file||busy} onClick={save} style={{minHeight:44,padding:".7rem 1.2rem"}}>確認待ちとして保存</button>
    <p role="status" aria-live="polite">{message}</p>
    {achievementEnabled&&<FormalControls candidates={rows.map(r=>r.snapshot)} />}
    <h2>保存した確認用データ</h2>
    <p>最大100件を表示します。再採点で内容が変わった場合は両方を残します。上にある結果が最新の成績とは限りません。</p>
    <p>練習用小テストは、Canvasの答案画面で得点と最新の受験回を確認してください。「Canvasと照合」に対応するのは採点用小テストです。照合結果はこの画面だけに表示され、受講者への公開や成績の確定は行いません。</p>
    {!rows.length && <p>表示できる確認用データはありません。</p>}
    <p>Canvasで答案を確認した後、1人・1小テストにつき1つの結果を本人表示に採用できます。採用しても表示期限は延長されません。</p>
    {!publicationEnabled&&<p>本人表示の機能は現在無効です。運用設定が必要です。</p>}
    {rows.map(({snapshot:r,importedAt,expiresAt,decision})=><section key={r.sourceKey+":"+r.revision}
      aria-label={`${r.step} ${stages[r.stage]} 受験${r.attempt}回目`} style={{border:"2px solid var(--fg-sub)",borderRadius:8,padding:"1rem",margin:"1rem 0",overflowWrap:"anywhere"}}>
      <h3>{r.step} · {stages[r.stage]} · 受験{r.attempt}回目</h3>
      <p>Canvas受講者番号 {r.canvasUserId}</p>
      <p>合計：{r.earned === null?"未採点を含む":r.earned} / {r.possible}点</p>
      <ul>{r.skills.map(s=><li key={s.key}>{skillLabels[s.key.split("/")[1]] ?? "技能"}：{s.earned===null?"未採点を含む":s.earned} / {s.possible}点</li>)}</ul>
      <p>保存日時：{new Date(importedAt).toLocaleString("ja-JP")}</p>
      {r.source?.kind==="canvas_report"?<p>取得元：Canvasの分析CSV（すべての受験回）<br />CSVファイル更新日時：{new Date(r.source.fileUpdatedAt).toLocaleString("ja-JP")}<br />取得日時：{new Date(r.source.fetchedAt).toLocaleString("ja-JP")} · 最新性は未確認</p>:<p>取得元：変換済みファイル</p>}
      <VerificationButton sourceKey={r.sourceKey} revision={r.revision} />
      <p>本人表示の期限：{new Date(expiresAt).toLocaleString('ja-JP')}</p>
      <DecisionControls key={decision?.token??'pending'} sourceKey={r.sourceKey} revision={r.revision} graded={r.earned!==null} decision={decision} refresh={refresh} disabled={busy||!publicationEnabled} />
    </section>)}
  </>;
}
