"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/postJson";

/** S2 提出フォーム: 残り文字数を常時表示し、超過時は提出不可（F3例外4） */
export function SubmissionForm({
  assignmentId,
  charLimit,
  version,
}: {
  assignmentId: string;
  charLimit: number;
  /** 画面が読んだ提出の版数（楽観ロック。サーバー側で現在版と照合し、食い違えば409） */
  version: number;
}) {
  const router = useRouter();
  const [promptText, setPromptText] = useState("");
  const [aiOutputText, setAiOutputText] = useState("");
  const [reflectionText, setReflectionText] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const remaining = charLimit - promptText.length;
  const overLimit = remaining < 0;

  async function handleSubmit() {
    setError("");
    setSubmitting(true);
    const result = await postJson(`/api/exercises/${assignmentId}/submit`, {
      promptText,
      aiOutputText,
      reflectionText,
      expectedVersion: version,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      // 版数の食い違い（別端末で更新済み）の場合は最新状態を取り直す
      router.refresh();
      return;
    }
    router.refresh();
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
          className={`text-input${overLimit ? " text-input--error" : ""}`}
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
        <label htmlFor="ai-output-text" style={{ display: "block", marginBottom: 4 }}>
          AIの実行結果の貼り付け（なくても提出できます）
        </label>
        <textarea
          id="ai-output-text"
          rows={4}
          maxLength={16000}
          value={aiOutputText}
          onChange={(e) => setAiOutputText(e.target.value)}
          className="text-input"
        />
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
          className="text-input"
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
