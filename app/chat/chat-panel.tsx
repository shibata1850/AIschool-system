"use client";

import { useRef, useState } from "react";
import { postJson } from "@/lib/client/postJson";
import { QUESTION_LIMIT } from "@/lib/f2/constants";
import { OutageNoticeBox, type OutageNotice } from "./outage-notice";

interface ChatEntry {
  question: string; // マスキング済みの質問のみ保持する
  reply?: string;
  blocked: boolean;
  piiDetected: boolean;
}

interface ChatResponse {
  maskedQuestion: string;
  piiDetected: boolean;
  blocked: boolean;
  reply?: string;
}

/** 503 の本文（静的教材モード）かどうか */
function asOutage(json: unknown): OutageNotice | null {
  if (!json || typeof json !== "object") return null;
  const o = json as { mode?: unknown; since?: unknown; material?: unknown };
  if (o.mode !== "static" || typeof o.since !== "string") return null;
  const m = o.material as { url?: unknown; title?: unknown } | null | undefined;
  const material =
    m && typeof m.url === "string" && typeof m.title === "string"
      ? { url: m.url, title: m.title }
      : null;
  return { since: o.since, material };
}

/**
 * S3 チャット本体: 「考え中」表示・タイムアウト（F2例外1）・静的教材モード（F2②）。
 * タイムアウトの判定は**サーバー側（10秒）**が正。ここでの中断は、サーバーが
 * 応答しない場合の保険としてやや長め（15秒）に置く。
 */
export function ChatPanel({ initialOutage }: { initialOutage: OutageNotice | null }) {
  const [question, setQuestion] = useState("");
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const [outage, setOutage] = useState<OutageNotice | null>(initialOutage);
  const controllerRef = useRef<AbortController | null>(null);
  const canceledRef = useRef(false);

  const remaining = QUESTION_LIMIT - question.length;
  const overLimit = remaining < 0;
  const empty = question.trim().length === 0;

  /** 考え中の質問をやめる。中断はサーバー側の推論も止める（無駄打ちを避ける） */
  function cancel() {
    canceledRef.current = true;
    controllerRef.current?.abort();
  }

  async function ask() {
    setError("");
    setThinking(true);
    canceledRef.current = false;
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const result = await postJson<ChatResponse>(
      "/api/chat",
      { question },
      { signal: controller.signal },
    );
    clearTimeout(timeout);
    controllerRef.current = null;
    setThinking(false);

    if (!result.ok) {
      // 停止中（静的教材モード）: エラーではなく案内に切り替える。質問文は残す
      const nextOutage = asOutage(result.json);
      if (nextOutage) {
        setOutage(nextOutage);
        return;
      }
      setError(
        result.aborted
          ? canceledRef.current
            ? "質問をやめました。「もう一度きく」を押すと、また聞けます"
            : "時間がかかりすぎています。「もう一度きく」を押してください"
          : result.message,
      );
      return;
    }
    const answer = result.data;
    // 応答が返った＝復旧している
    setOutage(null);
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
  }

  return (
    <section aria-label="チャット" style={{ marginTop: "1rem" }}>
      {outage && <OutageNoticeBox outage={outage} />}
      <ul style={{ listStyle: "none" }} aria-label="会話のきろく">
        {entries.map((entry, i) => (
          <li key={i} style={{ margin: "0.75rem 0" }}>
            {/*
              AIの回答は段落・箇条書きを含むため改行をそのまま描画する（pre-wrap）。
              Markdownは描画しない — AI出力のHTML化はXSSの経路になるため。
              記号を使わせない指示は TUTOR_SYSTEM_PROMPT 側で行う。
            */}
            <p style={{ color: "var(--fg-sub)" }}>あなた: {entry.question}</p>
            {entry.piiDetected && (
              <p style={{ color: "var(--warn)" }}>
                個人情報（氏名・電話番号など）は入力しないでください。該当箇所を伏せて送信しました
              </p>
            )}
            {entry.blocked ? (
              <p style={{ color: "var(--error)" }}>
                この質問にはお答えできません。講師にご相談ください
              </p>
            ) : (
              <p style={{ whiteSpace: "pre-wrap" }}>AI講師: {entry.reply}</p>
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
          className={`text-input${overLimit ? " text-input--error" : ""}`}
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
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="button" onClick={ask} disabled={thinking || overLimit || empty}>
            {error ? "もう一度きく" : thinking ? "考え中…" : "きく"}
          </button>
          {thinking && (
            <button type="button" onClick={cancel}>
              やめる
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
