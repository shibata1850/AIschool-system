"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/client/postJson";
import { attendanceLabels, helpLabels, workLabels, type Attendance, type HelpState, type WorkMode } from "@/lib/development/policy";

function useSave() {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [locked, setLocked] = useState(false);
  async function save(input: Record<string, unknown>) {
    if (pending.current || locked) return null;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 15000);
    const result = await postJson<{ revision: number }>("/api/development", input, { signal: abort.signal });
    clearTimeout(timer); pending.current = false; setBusy(false);
    if (!result.ok) {
      setError(result.message); setLocked(result.status === undefined || result.status === 409 || result.status >= 500); return null;
    }
    if (!result.data || result.data.revision !== Number(input.revision) + 1) {
      setError("保存結果を確認できません。再読み込みしてください"); setLocked(true); return null;
    }
    setMessage("保存しました"); return result.data.revision;
  }
  return { save, busy, locked, clear: () => { setMessage(""); setError(""); }, feedback: <>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    {locked && <button type="button" onClick={() => window.location.reload()}>再読み込み</button>}
  </> };
}
type Scope = { courseId: string; studentId: string };
export function ProjectForm({ scope, initial }: { scope: Scope; initial: { name: string; problem: string; editorUrl: string | null; previewUrl: string | null; revision: number } | null }) {
  const [value, setValue] = useState(initial ?? { name: "", problem: "", editorUrl: null, previewUrl: null, revision: 0 });
  const action = useSave();
  const router = useRouter();
  return <form onChange={action.clear} onSubmit={async e => { e.preventDefault(); const revision = await action.save({ ...scope, ...value, kind: "project" }); if (revision) { setValue({ ...value, revision }); router.refresh(); } }}>
    <fieldset disabled={action.busy || action.locked} className="development-fields">
      <legend>自分のシステム</legend>
      <label>システム名<input maxLength={120} value={value.name} onChange={e => setValue({ ...value, name: e.target.value })} /></label>
      <label>解決したい困りごと<textarea maxLength={1000} rows={3} value={value.problem} onChange={e => setValue({ ...value, problem: e.target.value })} /></label>
      <label>編集用URL<input type="url" maxLength={2048} value={value.editorUrl ?? ""} onChange={e => setValue({ ...value, editorUrl: e.target.value || null })} /></label>
      <label>利用・確認用URL<input type="url" maxLength={2048} value={value.previewUrl ?? ""} onChange={e => setValue({ ...value, previewUrl: e.target.value || null })} /></label>
      <button type="submit">{action.busy ? "保存中…" : "システム情報を保存"}</button>
    </fieldset>
    {action.feedback}
  </form>;
}
export function SessionForm({ scope, day, initial }: { scope: Scope; day: number; initial: { mode: WorkMode | null; difficulty: string; nextStep: string; help: HelpState; revision: number } | null }) {
  const [value, setValue] = useState<NonNullable<typeof initial>>(initial ?? { mode: null, difficulty: "", nextStep: "", help: "none", revision: 0 });
  const [requestHelp, setRequestHelp] = useState(value.help === "requested");
  const action = useSave();
  return <form onChange={action.clear} onSubmit={async e => {
    e.preventDefault(); const revision = await action.save({ ...scope, ...value, requestHelp, day, kind: "session" });
    if (revision) setValue({ ...value, revision, help: requestHelp ? "requested" : value.help === "resolved" ? "resolved" : "none" });
  }}>
    <fieldset disabled={action.busy || action.locked} className="development-fields">
      <legend>第{day}回の作業状況</legend>
      <div role="group" aria-label="現在の作業" className="development-modes">
        {Object.entries(workLabels).map(([mode, label]) => <label key={mode}>
          <input type="radio" name="work-mode" checked={value.mode === mode} onChange={() => setValue({ ...value, mode: mode as WorkMode })} />{label}
        </label>)}
      </div>
      {value.mode === null && <p>作業状態：未設定</p>}
      <label>今困っている点<textarea rows={2} maxLength={1000} value={value.difficulty} onChange={e => setValue({ ...value, difficulty: e.target.value })} /></label>
      <label>次に進めること<textarea rows={2} maxLength={1000} value={value.nextStep} onChange={e => setValue({ ...value, nextStep: e.target.value })} /></label>
      <label><input type="checkbox" checked={requestHelp} onChange={e => setRequestHelp(e.target.checked)} /> 講師に相談したい</label>
      <p>保存済みの相談状態：{helpLabels[value.help]}</p>
      <button type="submit">{action.busy ? "保存中…" : "作業状況を保存"}</button>
    </fieldset>{action.feedback}
  </form>;
}
export function AttendanceForm({ scope, day, initial }: { scope: Scope; day: number; initial: { status: Attendance; revision: number } | null }) {
  const [status, setStatus] = useState<Attendance>(initial?.status ?? "unset"), [revision, setRevision] = useState(initial?.revision ?? 0);
  const action = useSave(), router = useRouter();
  return <form onChange={action.clear} onSubmit={async e => { e.preventDefault(); const next = await action.save({ ...scope, day, status, revision, kind: "attendance" }); if (next) { setRevision(next); router.refresh(); } }}>
    <fieldset disabled={action.busy || action.locked} className="development-fields">
      <legend>出席記録</legend>
      <select aria-label="出席状態" value={status} onChange={e => setStatus(e.target.value as Attendance)}>
        {Object.entries(attendanceLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select><button type="submit">出席を保存</button>
    </fieldset>{action.feedback}
  </form>;
}
export function ResolveButton({ scope, day, revision }: { scope: Scope; day: number; revision: number }) {
  const action = useSave(), router = useRouter();
  const [done, setDone] = useState(false);
  return <div><button disabled={action.busy || action.locked || done} onClick={async () => {
    if (await action.save({ ...scope, day, revision, kind: "resolve" })) { setDone(true); router.refresh(); }
  }}>{done ? "対応済み" : "相談を対応済みにする"}</button>{action.feedback}</div>;
}
export function RefreshButton({ auto = false }: { auto?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 30000);
    return () => clearInterval(timer);
  }, [auto, router]);
  return <button type="button" onClick={() => router.refresh()}>最新の状況を取得</button>;
}
