"use client";

import { useState } from "react";
import { postJson } from "@/lib/client/postJson";

interface Props {
  studentId: string;
  displayName: string;
  seatNo: number;
  weekStart: string;
  initial: boolean | undefined;
}

/**
 * 1受講生分の出席トグル（出席/欠席）。押すとCanvas未使用のカスタム層に記録される。
 */
export function AttendanceRow({ studentId, displayName, seatNo, weekStart, initial }: Props) {
  const [attended, setAttended] = useState<boolean | undefined>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function set(next: boolean) {
    setSaving(true);
    setMessage("");
    const res = await postJson<{ attended: boolean }>("/api/teacher/attendance", {
      studentId,
      weekStart,
      attended: next,
    });
    setSaving(false);
    if (res.ok) {
      setAttended(next);
    } else {
      setMessage(res.message);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        flexWrap: "wrap",
        padding: "0.5rem 0",
      }}
    >
      <span style={{ minWidth: "9rem" }}>
        {seatNo}. {displayName}
      </span>
      <button
        type="button"
        onClick={() => set(true)}
        disabled={saving}
        aria-pressed={attended === true}
        className={attended === true ? "button button--primary" : "button"}
      >
        出席
      </button>
      <button
        type="button"
        onClick={() => set(false)}
        disabled={saving}
        aria-pressed={attended === false}
        className="button"
        style={attended === false ? { borderColor: "var(--warn)", color: "var(--warn)" } : undefined}
      >
        欠席
      </button>
      <span className="muted">
        {attended === true ? "出席" : attended === false ? "欠席" : "未記録"}
      </span>
      {message && (
        <span role="status" style={{ color: "#d33" }}>
          {message}
        </span>
      )}
    </div>
  );
}
