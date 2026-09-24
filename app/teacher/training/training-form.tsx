"use client";
import { useRef, useState } from "react";
import { postJson } from "@/lib/client/postJson";
import { parseTrainingSettings, type TrainingSettings, type TrainingLinkPolicy } from "@/lib/course/trainingPolicy";

export function TrainingForm({ initial, links }: { initial: TrainingSettings; links: TrainingLinkPolicy }) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reloadRequired, setReloadRequired] = useState(false);
  const pending = useRef(false);
  function change(next: TrainingSettings) { setValue(next); setMessage(""); setError(""); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || reloadRequired) return;
    pending.current = true; setBusy(true); setMessage(""); setError("");
    const result = await postJson<unknown>("/api/teacher/training", value);
    pending.current = false; setBusy(false);
    if (!result.ok) {
      setError(result.message);
      // A timeout may still have committed. Reload before attempting another write.
      setReloadRequired(result.status === 409 || result.status === undefined || result.status >= 500);
      return;
    }
    const saved = parseTrainingSettings(result.data, initial.courseId, links);
    if (!saved || saved.revision !== value.revision + 1) {
      setError("保存結果を確認できません。再読み込みしてください。"); setReloadRequired(true); return;
    }
    setValue(saved); setMessage("保存しました");
  }
  const control = { width: "100%", minWidth: 0, minHeight: 44, fontSize: "1rem" };
  return <form onSubmit={submit}>
    <fieldset disabled={busy || reloadRequired} style={{ border: 0, padding: 0, minWidth: 0, display: "grid", gap: "1rem" }}>
      <legend>ホームの表示</legend>
      <label style={{ minHeight: 44 }}><input type="radio" name="mode" checked={value.mode === "legacy"}
        onChange={() => change({ ...value, mode: "legacy" })} /> 従来の演習型</label>
      <label style={{ minHeight: 44 }}><input type="radio" name="mode" checked={value.mode === "btob"}
        onChange={() => change({ ...value, mode: "btob" })} /> BtoB研修型</label>
      <label htmlFor="training-current-day">現在の授業</label>
      <select id="training-current-day" style={control} value={value.currentDay ?? ""}
        onChange={e => change({ ...value, currentDay: e.target.value ? Number(e.target.value) : null })}>
        <option value="">未選択</option>
        {value.days.map(day => <option key={day.day} value={day.day}>第{day.day}回：{day.title}</option>)}
      </select>
      {value.days.map(day => <div key={day.day}>
        <label htmlFor={`training-title-${day.day}`}>第{day.day}回の授業名</label>
        <input id={`training-title-${day.day}`} style={control} required maxLength={120} value={day.title}
          onChange={e => change({ ...value, days: value.days.map(item => item.day === day.day ? { ...item, title: e.target.value } : item) })} />
        <label htmlFor={`training-material-${day.day}`}>教材</label>
        <select id={`training-material-${day.day}`} style={control} value={day.materialUrl ?? ""}
          onChange={e => change({ ...value, days: value.days.map(item => item.day === day.day ? { ...item, materialUrl: e.target.value || null } : item) })}>
          <option value="">未設定</option>
          {links.materialUrls.map(url => <option key={url} value={url}>{url}</option>)}
        </select>
        <label htmlFor={`training-quiz-${day.day}`}>小テスト</label>
        <select id={`training-quiz-${day.day}`} style={control} value={day.quizUrl ?? ""}
          onChange={e => change({ ...value, days: value.days.map(item => item.day === day.day ? { ...item, quizUrl: e.target.value || null } : item) })}>
          <option value="">未設定</option>
          {links.quizUrls.map(url => <option key={url} value={url}>{url}</option>)}
        </select>
      </div>)}
      <button type="submit">{busy ? "保存中…" : "保存"}</button>
    </fieldset>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    {reloadRequired && <button type="button" onClick={() => window.location.reload()}>再読み込み</button>}
  </form>;
}
