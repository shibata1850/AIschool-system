import { createAiClient, type AiClient } from "@/lib/ai";
import { QUESTION_LIMIT } from "./constants";
import { filterContent } from "./contentFilter";
import { maskPersonalInfo } from "./masking";

/**
 * AI講師の応答パイプライン(F2)。
 * 質問 → 個人情報マスキング → 入力フィルタ → AI推論（抽象化レイヤー経由）
 * → 出力フィルタ → 表示。この順序を変えない（マスキング前のテキストを外部へ送らない）。
 */

/** 利用者の入力起因のエラー（400にしてよいもの）。それ以外はサーバー都合として扱う */
export class ValidationError extends Error {}

export const TUTOR_SYSTEM_PROMPT = [
  "あなたはNext Gen AI SchoolのAI講師です。受講生には小学生からシニアまでが含まれます。",
  "・平易な日本語で答え、専門用語には言い換えを添える",
  "・答えは短く区切り、次の一歩を促す",
  "・危険・不適切な話題には答えず、先生に相談するよう案内する",
].join("\n");

export interface TutorAnswer {
  /** マスキング済みの質問（ログ・履歴にはこちらだけを保存する） */
  maskedQuestion: string;
  piiDetected: boolean;
  blocked: boolean;
  /** blocked=false のときのみ講評テキストが入る */
  reply?: string;
  model?: string;
}

export async function answerQuestion(
  question: string,
  client: AiClient = createAiClient(),
): Promise<TutorAnswer> {
  if (question.trim().length === 0) {
    throw new ValidationError("質問を入力してください");
  }
  if (question.length > QUESTION_LIMIT) {
    throw new ValidationError(
      `質問は${QUESTION_LIMIT.toLocaleString("ja-JP")}文字以内で入力してください`,
    );
  }

  const { masked, piiDetected } = maskPersonalInfo(question);

  const inputCheck = filterContent(masked);
  if (!inputCheck.allowed) {
    return { maskedQuestion: masked, piiDetected, blocked: true };
  }

  const result = await client.complete({
    system: TUTOR_SYSTEM_PROMPT,
    messages: [{ role: "user", content: masked }],
  });

  const outputCheck = filterContent(result.content);
  if (!outputCheck.allowed) {
    return { maskedQuestion: masked, piiDetected, blocked: true };
  }

  return {
    maskedQuestion: masked,
    piiDetected,
    blocked: false,
    reply: result.content,
    model: result.model,
  };
}
