"use client";
import {useState} from "react";
import type {VerificationResult} from "@/lib/quiz-review/verification";
export default function VerificationButton({sourceKey,revision}:{sourceKey:string;revision:string}) {
  const [busy,setBusy]=useState(false),[result,setResult]=useState<VerificationResult|null>(null),[error,setError]=useState("");
  async function verify() {
    if(busy) return;
    setBusy(true);setResult(null);setError("");
    try {
      const query=new URLSearchParams({sourceKey,revision});
      const response=await fetch("/api/teacher/quiz-review/verify?"+query,{cache:"no-store"});
      if(!response.ok) throw new Error(await response.text());
      setResult(await response.json());
    } catch(e) {setError(e instanceof Error?e.message:"照合できませんでした。再度お試しください。");}
    finally {setBusy(false);}
  }
  return <div>
    <button onClick={verify} disabled={busy} style={{minHeight:44,padding:".7rem 1.2rem"}}>{busy?"Canvasと照合中…":"Canvasと照合"}</button>
    <div aria-live="polite">
      {error && <p>{error}</p>}
      {result && <><p>{result.message}</p><p>照合日時：{new Date(result.checkedAt).toLocaleString("ja-JP")}</p></>}
    </div>
  </div>;
}
