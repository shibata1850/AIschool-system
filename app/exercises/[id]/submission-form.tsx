"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** S2 提出フォーム: 残り文字数を常時表示し、超過時は提出不可（F3例外4） */
export function SubmissionForm({
  assignmentId,
  charLimit,
}: {
  assignmentId: string;
  charLimit: number;
}) {
  const router = useRouter();
  const [promptText, setPromptText] = useState("");
  const [reflectionText, setReflectionText] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const remaining = charLimit - promptText.length;
  const overLimit = remaining < 0;

  async function handleSubmit() {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/exercises/${assignmentId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ promptText, reflectionText }),
      });
      if (!res.ok) {
        setError(`送信できませんでした: ${await res.text()}`);
        return;
      }
      router.refresh();
    } catch {
      setError("送信できませんでした。もう一度「提出する」を押してください");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-label="提出フォーム" style={{ marginTop: "1.5rem" }}>
      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="prompt-text" style={{ display: "block", marginBottom: 4 }}>
          プロンプト本文
        </label>
        <textarea
          id="prompt-text"
          rows={8}
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
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
        <p
          aria-live="polite"
          style={{ color: overLimit ? "var(--error)" : "var(--fg-sub)" }}
        >
          {overLimit
            ? `文字数が上限（${charLimit}文字）を超えています。${-remaining}文字へらしてください`
            : `のこり ${remaining} 文字`}
        </p>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="reflection-text" style={{ display: "block", marginBottom: 4 }}>
          ふりかえりメモ（なくても提出できます）
        </label>
        <textarea
          id="reflection-text"
          rows={2}
          maxLength={500}
          value={reflectionText}
          onChange={(e) => setReflectionText(e.target.value)}
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
        <p role="alert" style={{ color: "var(--error)", marginBottom: "1rem" }}>
          {error}
        </p>
      )}

      <button type="button" onClick={handleSubmit} disabled={overLimit || submitting}>
        {submitting ? "送信中…" : "提出する"}
      </button>
    </section>
  );
}
