"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * S7 確認フォーム: 完了（講師スコア確定）または差戻し（コメント必須）。
 * スコアは文字列stateで保持し、空欄のままの確定を拒否する
 * （2026-07-03 監査指摘#4: Number("")===0 による0点確定の防止）。
 */
export function ReviewForm({
  submissionId,
  aiScore,
}: {
  submissionId: string;
  aiScore?: number;
}) {
  const router = useRouter();
  const [scoreText, setScoreText] = useState(
    aiScore !== undefined ? String(aiScore) : "",
  );
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(action: "complete" | "return") {
    setError("");
    let score: number | undefined;
    if (action === "complete") {
      if (scoreText.trim() === "") {
        setError("スコアを入力してください（空欄のままでは確定できません）");
        return;
      }
      score = Number(scoreText);
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        setError("スコアは0〜100の数値で入力してください");
        return;
      }
    }
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
    } catch {
      // 監査指摘: ネットワーク断で無反応にならないよう必ずエラーを表示する
      setError("送信できませんでした。通信を確認してもう一度押してください");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: "1rem" }}>
      <div style={{ marginBottom: "0.75rem" }}>
        <label htmlFor={`score-${submissionId}`} style={{ marginRight: 8 }}>
          講師スコア（0〜100{aiScore !== undefined ? "・はじめはAIスコア" : "・手動採点"}）
        </label>
        <input
          id={`score-${submissionId}`}
          type="number"
          min={0}
          max={100}
          value={scoreText}
          onChange={(e) => setScoreText(e.target.value)}
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
