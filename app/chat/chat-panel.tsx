"use client";

import { useState } from "react";
import { QUESTION_LIMIT } from "@/lib/f2/constants";

interface ChatEntry {
  question: string; // マスキング済みの質問のみ保持する
  reply?: string;
  blocked: boolean;
  piiDetected: boolean;
}

/** S3 チャット本体: 「考え中」表示・10秒タイムアウト（F2例外1） */
export function ChatPanel() {
  const [question, setQuestion] = useState("");
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");

  const remaining = QUESTION_LIMIT - question.length;
  const overLimit = remaining < 0;
  const empty = question.trim().length === 0;

  async function ask() {
    setError("");
    setThinking(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
        signal: controller.signal,
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const answer = (await res.json()) as {
        maskedQuestion: string;
        piiDetected: boolean;
        blocked: boolean;
        reply?: string;
      };
      setEntries((prev) => [
        ...prev,
        {
          question: answer.maskedQuestion,
          reply: answer.reply,
          blocked: answer.blocked,
          piiDetected: answer.piiDetected,
        },
      ]);
      setQuestion("");
    } catch {
      setError("時間がかかりすぎています。「もう一度きく」を押してください");
    } finally {
      clearTimeout(timeout);
      setThinking(false);
    }
  }

  return (
    <section aria-label="チャット" style={{ marginTop: "1rem" }}>
      <ul style={{ listStyle: "none" }} aria-label="会話のきろく">
        {entries.map((entry, i) => (
          <li key={i} style={{ margin: "0.75rem 0" }}>
            <p style={{ color: "var(--fg-sub)" }}>あなた: {entry.question}</p>
            {entry.piiDetected && (
              <p style={{ color: "var(--warn)" }}>
                個人情報（名前・電話番号など）は入力しないでね。かくして送りました
              </p>
            )}
            {entry.blocked ? (
              <p style={{ color: "var(--error)" }}>
                この質問にはお答えできません。先生に聞いてください
              </p>
            ) : (
              <p>AI講師: {entry.reply}</p>
            )}
          </li>
        ))}
        {thinking && <li aria-label="考え中">考え中…</li>}
      </ul>

      <div style={{ marginTop: "1rem" }}>
        <label htmlFor="question" style={{ display: "block", marginBottom: 4 }}>
          質問（しつもん）
        </label>
        <textarea
          id="question"
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          style={{
            width: "100%",
            fontSize: "1rem",
            padding: "0.75rem",
            background: "var(--bg-panel)",
            color: "var(--fg)",
            border: `2px solid ${overLimit ? "var(--error)" : "var(--fg-sub)"}`,
            borderRadius: 8,
          }}
        />
        <p aria-live="polite" style={{ color: overLimit ? "var(--error)" : "var(--fg-sub)" }}>
          {overLimit
            ? `質問は${QUESTION_LIMIT}文字以内で入力してください`
            : `のこり ${remaining} 文字`}
        </p>
        {error && (
          <p role="alert" style={{ color: "var(--error)" }}>
            {error}
          </p>
        )}
        <button type="button" onClick={ask} disabled={thinking || overLimit || empty}>
          {error ? "もう一度きく" : thinking ? "考え中…" : "きく"}
        </button>
      </div>
    </section>
  );
}
