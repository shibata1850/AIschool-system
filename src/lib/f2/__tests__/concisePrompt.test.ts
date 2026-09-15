import { describe, expect, it, vi } from "vitest";
import { answerQuestion, TUTOR_SYSTEM_PROMPT } from "../tutor";
import type { AiClient } from "@/lib/ai";

describe("短い回答の指示と安全性", () => {
  it("全体の文字数と段落ごとの分量を指定する", () => {
    expect(TUTOR_SYSTEM_PROMPT).toContain("回答全体で200文字程度");
    expect(TUTOR_SYSTEM_PROMPT).toContain("第1段落は結論を1文");
    expect(TUTOR_SYSTEM_PROMPT).toContain("第2段落は理由・違い・判断材料を1〜2文");
    expect(TUTOR_SYSTEM_PROMPT).toContain("毎回質問で締めくくらない");
  });

  it("簡潔さより必要な注意事項を優先し、不確実性・人への確認を残す", () => {
    expect(TUTOR_SYSTEM_PROMPT).toContain("必要な注意事項を削らず");
    expect(TUTOR_SYSTEM_PROMPT).toContain("安全上の注意と人への確認を文字数より優先");
    expect(TUTOR_SYSTEM_PROMPT).toContain("確かではありません");
    expect(TUTOR_SYSTEM_PROMPT).toContain("聞かれたら想像で答えず、講師に確認");
    expect(TUTOR_SYSTEM_PROMPT).toContain("画面で確認してください");
    expect(TUTOR_SYSTEM_PROMPT).toContain("最終確認は人に相談するよう必ず伝える");
    expect(TUTOR_SYSTEM_PROMPT).toContain("「大丈夫です」と答えない");
  });

  it("注意事項を末尾から切らず、追加の推論も行わない", async () => {
    const reply = "判断材料を確認してください。".repeat(30) + "\n\n最終確認は講師に相談してください。";
    const complete = vi.fn().mockResolvedValue({ content: reply, model: "fixture" });
    const client: AiClient = { provider: "mock", complete };
    const result = await answerQuestion("設計を確認する観点は？", client);
    expect(result.reply).toBe(reply);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].system).toBe(TUTOR_SYSTEM_PROMPT);
  });
});
