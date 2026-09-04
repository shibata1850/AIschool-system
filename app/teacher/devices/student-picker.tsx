"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/postJson";

/** 空席を表す選択肢の値（`null` は <option value> に入れられないため） */
const EMPTY = "";

/**
 * S9: 座席に座る受講生を選ぶ（NearHubタッチ前提・44px以上）。
 *
 * 「保存」を押した時だけ送信する。選ぶそばから確定すると、
 * 触れただけの取り違えがそのまま割当変更になってしまう。
 */
export function StudentPicker({
  seatNo,
  studentId,
  roster,
}: {
  seatNo: number;
  studentId: string | null;
  roster: Array<{ id: string; displayName: string }>;
}) {
  const router = useRouter();
  const [value, setValue] = useState(studentId ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const selectId = `seat-${seatNo}-student`;

  async function save() {
    setError("");
    setDone(false);
    setBusy(true);
    const result = await postJson(`/api/devices/${seatNo}/student`, {
      studentId: value === EMPTY ? null : value,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDone(true);
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
      <label htmlFor={selectId} className="visually-hidden">
        座席{seatNo}の受講生
      </label>
      <select
        id={selectId}
        value={value}
        disabled={busy}
        onChange={(e) => {
          setValue(e.target.value);
          setDone(false);
        }}
        style={{ minHeight: 44, fontSize: "1rem" }}
      >
        <option value={EMPTY}>空席</option>
        {roster.map((s) => (
          <option key={s.id} value={s.id}>
            {s.displayName}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy || value === (studentId ?? EMPTY)}
        onClick={save}
      >
        {busy ? "保存中…" : "保存"}
      </button>
      {done && <span role="status">保存しました</span>}
      {error && (
        <p role="alert" style={{ color: "var(--error)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
