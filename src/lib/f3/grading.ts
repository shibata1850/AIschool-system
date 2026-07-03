import { createAiClient, type AiClient } from "@/lib/ai";
import type { AiGradeResult, Assignment } from "./types";

export const GRADING_PROMPT_VERSION = "grading-v1";

export interface Grader {
  grade(assignment: Assignment, promptText: string): Promise<AiGradeResult>;
}

/**
 * 開発・E2E用の決定的な採点器（外部通信なし）。
 * スコアは本文の長さから決定的に算出する（テストの再現性のため）。
 */
export class MockGrader implements Grader {
  async grade(_assignment: Assignment, promptText: string): Promise<AiGradeResult> {
    const totalScore = Math.min(100, 60 + Math.floor(promptText.length / 20));
    return {
      totalScore,
      feedback:
        "指示がはっきり書けています。次は「出力の形式」も指定してみましょう。",
      rationale: `文字数${promptText.length}に基づくモック採点`,
      model: "mock-v1",
      promptVersion: GRADING_PROMPT_VERSION,
    };
  }
}

/** AI推論の抽象化レイヤー経由で採点する実装（JSON応答を検証して採用） */
export class AiGrader implements Grader {
  constructor(private client: AiClient) {}

  async grade(assignment: Assignment, promptText: string): Promise<AiGradeResult> {
    const result = await this.client.complete({
      system: [
        "あなたはプロンプト演習の採点者です。受講生には小中高生も含まれます。",
        "次のJSONだけを出力してください（他のテキスト禁止）:",
        '{"totalScore": 0-100の整数, "feedback": "受講生向け講評（ほめる点1つ以上＋改善点1つ、平易な日本語）", "rationale": "講師向けの採点根拠"}',
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: `課題:「${assignment.title}」\n${assignment.description}\n\n提出されたプロンプト:\n${promptText}`,
        },
      ],
    });

    const parsed = JSON.parse(result.content) as {
      totalScore: number;
      feedback: string;
      rationale: string;
    };
    if (
      typeof parsed.totalScore !== "number" ||
      parsed.totalScore < 0 ||
      parsed.totalScore > 100
    ) {
      throw new Error("AI採点の応答形式が不正です（totalScore）");
    }
    return {
      totalScore: Math.round(parsed.totalScore),
      feedback: parsed.feedback,
      rationale: parsed.rationale,
      model: result.model,
      promptVersion: GRADING_PROMPT_VERSION,
    };
  }
}

/** AI_PROVIDER に応じた採点器を返す（mock以外は抽象化レイヤー経由） */
export function createGrader(
  env: Record<string, string | undefined> = process.env,
): Grader {
  const provider = env.AI_PROVIDER ?? "mock";
  if (provider === "mock") return new MockGrader();
  return new AiGrader(createAiClient(env));
}
