"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** S7 確認フォーム: 完了（講師スコア確定）または差戻し（コメント必須） */
export function ReviewForm({
  submissionId,
  aiScore,
}: {
  submissionId: string;
  aiScore: number;
}) {
  const router = useRouter();
  const [score, setScore] = useState(aiScore);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(action: "complete" | "return") {
    setError("");
    if (action === "return" && comment.trim().length === 0) {
      setError("差戻しにはコメントが必要です");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, score, comment }),
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: "1rem" }}>
      <div style={{ marginBottom: "0.75rem" }}>
        <label htmlFor={`score-${submissionId}`} style={{ marginRight: 8 }}>
          講師スコア（0〜100・はじめはAIスコア）
        </label>
        <input
          id={`score-${submissionId}`}
          type="number"
          min={0}
          max={100}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          style={{
            fontSize: "1rem",
            padding: "0.5rem",
            width: "6rem",
            background: "var(--bg-panel)",
            color: "var(--fg)",
            border: "2px solid var(--fg-sub)",
            borderRadius: 8,
          }}
        />
      </div>
      <div style={{ marginBottom: "0.75rem" }}>
        <label
          htmlFor={`comment-${submissionId}`}
          style={{ display: "block", marginBottom: 4 }}
        >
          コメント（差戻しのときは必須・1,000文字まで）
        </label>
        <textarea
          id={`comment-${submissionId}`}
          rows={2}
          maxLength={1000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          style={{
            width: "100%",
            fontSize: "1rem",
            padding: "0.75rem",
            background: "var(--bg-panel)",
            color: "var(--fg)",
            border: "2px solid var(--fg-sub)",
            borderRadius: 8,
          }}
        />
      </div>
      {error && (
        <p role="alert" style={{ color: "var(--error)", marginBottom: "0.75rem" }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: "1rem" }}>
        <button type="button" disabled={busy} onClick={() => send("complete")}>
          完了にする
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => send("return")}
          style={{ borderColor: "var(--warn)", color: "var(--warn)" }}
        >
          差戻す
        </button>
      </div>
    </div>
  );
}
