"use client";
import { useState } from "react";
import { postJson } from "@/lib/client/postJson";

export function AllocationForm({roster,exercises}:{roster:{id:string;displayName:string}[];exercises:{id:string;title:string}[]}) {
  const [assignmentId,setAssignmentId] = useState("");
  const [selected,setSelected] = useState<string[]>([]);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  async function submit(e:React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);setMessage("");setError("");
    const result = await postJson<{created:number;skipped:number}>("/api/teacher/assignments",{assignmentId,studentIds:selected});
    setBusy(false);
    if (!result.ok) {setError(result.message);return;}
    setMessage(`割り当てました（新規${result.data.created}件・割当済み${result.data.skipped}件）`);
  }
  return <form onSubmit={submit} style={{display:"grid",gap:"1rem"}}>
    <label htmlFor="allocation-exercise">課題</label>
    <select id="allocation-exercise" value={assignmentId} disabled={busy} required onChange={e=>{setAssignmentId(e.target.value);setMessage("");}}
      style={{width:"100%",minWidth:0,minHeight:44,fontSize:"1rem"}}>
      <option value="">課題を選択</option>
      {exercises.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}
    </select>
    <fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}>
      <legend>受講生</legend>
      {roster.map(s=><label key={s.id} style={{display:"flex",alignItems:"center",gap:"0.75rem",minHeight:44,overflowWrap:"anywhere"}}>
        <input type="checkbox" checked={selected.includes(s.id)} onChange={e=>{setSelected(current=>e.target.checked?[...current,s.id]:current.filter(id=>id!==s.id));setMessage("");}} />
        {s.displayName}
      </label>)}
    </fieldset>
    <button type="submit" disabled={busy || !assignmentId || !selected.length}>{busy?"割当中…":`選択した${selected.length}人に割り当てる`}</button>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </form>;
}
