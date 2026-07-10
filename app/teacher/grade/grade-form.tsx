"use client";

import { useState } from "react";
import { postJson } from "@/lib/client/postJson";

interface Props {
  userId: number;
  studentName: string;
  initialScore: number | null;
}

/**
 * 1受講生分の点数入力→Canvas成績表へ反映（B-3）。
 * 成功/失敗を行内に明示する（画面仕様書 共通仕様: 何が起きたか＋次にすること）。
 */
export function GradeForm({ userId, studentName, initialScore }: Props) {
  const [score, setScore] = useState<string>(initialScore?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [ok, setOk] = useState<boolean | null>(null);

  async function save() {
    setSaving(true);
    setMessage("");
    setOk(null);
    const result = await postJson<{ score: number }>("/api/teacher/grade", {
      userId,
      score: Number(score),
    });
    setSaving(false);
    if (result.ok) {
      setOk(true);
      setMessage(`${result.data.score}点で反映しました`);
    } else {
      setOk(false);
      setMessage(result.message);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
      <label style={{ minWidth: "8rem" }}>{studentName}</label>
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={score}
        aria-label={`${studentName}の点数`}
        onChange={(e) => setScore(e.target.value)}
        style={{ width: "6rem", padding: "0.4rem", fontSize: "1rem" }}
      />
      <button
        type="button"
        onClick={save}
        disabled={saving || score === ""}
        style={{ minHeight: "44px", padding: "0 1rem", fontSize: "1rem" }}
      >
        {saving ? "反映中…" : "成績を反映"}
      </button>
      {message && (
        <span role="status" style={{ color: ok ? "#2a7" : "#d33" }}>
          {message}
        </span>
      )}
    </div>
  );
}
