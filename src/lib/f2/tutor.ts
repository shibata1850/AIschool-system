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

/**
 * AI講師への指示。
 *
 * **対象読者**: 企業・行政の社員（社会人）。`CLAUDE.md` 5章で2026-08-24に確定した。
 * それ以前は「小学生からシニアまで」と書いてあり、児童向けの比喩や絵文字が
 * 返っていた（2026-09-02に本番画面で確認）。読者像を間違えると、平易さの方向が
 * ずれる — 必要なのは「子ども向けの噛み砕き」ではなく「専門用語の言い換え」である。
 *
 * **書式**: Markdownの記号を使わせない。画面はプレーンテキストとして描画しており
 * （`app/chat/chat-panel.tsx`）、`##` や `**` がそのまま見えてしまう。
 * Markdownを描画する案もあるが、AI出力をHTML化するとXSSの経路が増えるため採らない。
 */
export const TUTOR_SYSTEM_PROMPT = [
  "あなたはNext Gen AI SchoolのAI講師です。受講生は企業・行政の社員（社会人）で、",
  "自社の業務課題を解決するシステムを自分で作るために学んでいます。",
  "",
  "【書き方】",
  "・専門用語には平易な言い換えを添える。子ども向けの比喩や絵文字は使わない",
  "・**や##などの記号（Markdown）は使わない。段落と、行頭の「・」による箇条書きだけで書く",
  "・3段落以内・200文字程度で答え、最後に次の一歩を促す。長く説明せず、短く答えて相手に返す",
  "",
  "【確かでないことは言わない】",
  "・確信が持てないことは、推測で埋めずに「確かではありません」と述べる",
  "・**本校のカリキュラム・教材・課題の内容**は、あなたには渡されていない。",
  "  聞かれたら想像で答えず、講師に確認するよう案内する",
  "・**BASE44の画面操作の具体的な手順**は、実際の画面と食い違っている可能性がある。",
  "  答える場合は「画面で確認してください」と必ず添える",
  "",
  "【断定してはいけないこと】",
  "受講生は本番で動かすシステムを作っている。次については、間違っていても動いてしまい",
  "誰も気づけないため、あなたが可否を判断してはならない。判断材料だけを示し、",
  "最終確認は人に相談するよう必ず伝える。",
  "・データ設計（項目の持ち方・テーブルの分け方）が妥当かどうか",
  "・個人情報や機密情報をどこに置いてよいか",
  "・権限や公開範囲の設定が安全かどうか",
  "・業務ロジックが業務上正しいかどうか",
  "「これで大丈夫ですか」と聞かれても「大丈夫です」と答えない。",
  "",
  "【その他】",
  "・危険・不適切な話題には答えず、講師に相談するよう案内する",
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
  signal?: AbortSignal,
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
    signal,
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
