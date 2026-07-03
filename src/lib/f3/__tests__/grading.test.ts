import { describe, expect, it } from "vitest";
import type { AiClient, AiCompletionRequest, AiCompletionResult } from "@/lib/ai";
import { AiGrader, BLOCKED_FEEDBACK_FALLBACK } from "../grading";
import type { Assignment } from "../types";

const assignment: Assignment = {
  id: "a1",
  title: "テスト課題",
  description: "説明",
  charLimit: 4000,
  deadline: "2027-03-31T23:59:00+09:00",
};

/** 外部送信された内容を記録し、指定したJSONを返すテスト用クライアント */
class RecordingClient implements AiClient {
  readonly provider = "mock" as const;
  lastRequest?: AiCompletionRequest;
  constructor(private response: object) {}
  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    this.lastRequest = request;
    return { content: JSON.stringify(this.response), model: "test-model" };
  }
}

describe("AiGrader（2026-07-03 監査指摘#1・#2の回帰）", () => {
  it("提出文の個人情報はマスキングしてから外部AIへ送信する", async () => {
    const client = new RecordingClient({
      totalScore: 70,
      feedback: "よく書けています。次は形式も指定しよう",
      rationale: "指示が明確",
    });
    await new AiGrader(client).grade(
      assignment,
      "連絡先は090-1234-5678です。メロンパンの紹介文を書いて",
    );
    const sent = client.lastRequest?.messages[0]?.content ?? "";
    expect(sent).not.toContain("090-1234-5678");
    expect(sent).toContain("（電話番号）");
  });

  it("フィルタでブロックされた講評は定型文に差し替える（生徒に直接出さない）", async () => {
    const client = new RecordingClient({
      totalScore: 60,
      feedback: "この薬物の話はよくない例です",
      rationale: "講師向けの根拠",
    });
    const grade = await new AiGrader(client).grade(assignment, "テスト提出");
    expect(grade.feedback).toBe(BLOCKED_FEEDBACK_FALLBACK);
    expect(grade.totalScore).toBe(60);
  });

  it("スコアが0-100の数値でない応答はエラー（採点失敗として扱う）", async () => {
    const client = new RecordingClient({
      totalScore: 999,
      feedback: "x",
      rationale: "y",
    });
    await expect(
      new AiGrader(client).grade(assignment, "テスト提出"),
    ).rejects.toThrow(/totalScore/);
  });
});
