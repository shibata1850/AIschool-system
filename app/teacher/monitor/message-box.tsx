"use client";

import { useState } from "react";
import { TEACHER_MESSAGE_LIMIT } from "@/lib/f2/constants";

/**
 * S6のタイルから受講生へ一言送る（介入導線）。
 *
 * プロンプト演習では「この内容をプロンプトに入れてみてください」と**テキストそのものを
 * 手渡す**場面が多く、口頭では渡せない。座席を見ながら送れることが要点なので、
 * 宛先選択ではなくタイルの中に置いている。
 *
 * 返信は受け付けない（同じ教室にいるので口頭で足りる — 2026-09-02 の設計判断）。
 */
export function MessageBox({
  studentId,
  displayName,
}: {
  studentId: string;
  displayName: string;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const tooLong = body.length > TEACHER_MESSAGE_LIMIT;

  async function send() {
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/teacher/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId, body }),
      });
      if (!res.ok) {
        setError(await res.text());
        setState("error");
        return;
      }
      setBody("");
      setState("sent");
    } catch {
      setError("送信できませんでした。もう一度お試しください");
      setState("error");
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        一言送る
      </button>
    );
  }

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <label htmlFor={`msg-${studentId}`} style={{ display: "block", marginBottom: 4 }}>
        {displayName}さんへ送る
      </label>
      <textarea
        id={`msg-${studentId}`}
        rows={3}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (state !== "idle") setState("idle");
        }}
        style={{ width: "100%" }}
      />
      <p className="muted">
        のこり {TEACHER_MESSAGE_LIMIT - body.length} 文字
      </p>
      {tooLong && (
        <p style={{ color: "var(--error)" }}>
          メッセージは{TEACHER_MESSAGE_LIMIT.toLocaleString("ja-JP")}文字以内で入力してください
        </p>
      )}
      {state === "sent" && <p style={{ color: "var(--ok, #2e8b57)" }}>送りました</p>}
      {state === "error" && <p style={{ color: "var(--error)" }}>{error}</p>}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <button
          type="button"
          onClick={send}
          disabled={body.trim().length === 0 || tooLong || state === "sending"}
        >
          {state === "sending" ? "送信中…" : "送る"}
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          閉じる
        </button>
      </div>
    </div>
  );
}
