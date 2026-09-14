"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/client/postJson";

export function AssignmentLinkForm({ exercises, targets }: {
  exercises: { id: string; title: string }[];
  targets: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [assignmentId, setAssignmentId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !assignmentId || !targetId) return;
    setBusy(true); setMessage(""); setError("");
    const result = await postJson<{ created: boolean }>("/api/teacher/assignment-links", {
      assignmentId, canvasAssignmentId: Number(targetId),
    });
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setMessage(result.data.created ? "対応を登録しました" : "同じ対応が登録済みです");
    setAssignmentId(""); setTargetId("");
    router.refresh();
  }
  return <form onSubmit={save} style={{ display: "grid", gap: "1rem", minWidth: 0 }}>
    <label style={{ display: "grid", gap: "0.5rem", minWidth: 0 }}>
      演習
      <select required disabled={busy} value={assignmentId} onChange={e => setAssignmentId(e.target.value)} style={{ minHeight: 44, width: "100%", minWidth: 0, fontSize: "1rem" }}>
        <option value="">演習を選択</option>
        {exercises.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>
    </label>
    <label style={{ display: "grid", gap: "0.5rem", minWidth: 0 }}>
      Canvas課題（100点満点）
      <select required disabled={busy} value={targetId} onChange={e => setTargetId(e.target.value)} style={{ minHeight: 44, width: "100%", minWidth: 0, fontSize: "1rem" }}>
        <option value="">Canvas課題を選択</option>
        {targets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    <button type="submit" disabled={busy || !assignmentId || !targetId} style={{ minHeight: 44 }}>{busy ? "登録中…" : "対応を登録"}</button>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </form>;
}
