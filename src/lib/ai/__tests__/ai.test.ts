import { describe, expect, it } from "vitest";
import { createAiClient } from "../index";
import { MockAiClient } from "../mockClient";

describe("createAiClient（AI推論の抽象化レイヤー）", () => {
  it("AI_PROVIDER未設定なら mock を返す（既定で外部通信しない）", () => {
    const client = createAiClient({});
    expect(client.provider).toBe("mock");
  });

  it("AI_PROVIDER=claude で ANTHROPIC_API_KEY 未設定ならエラー", () => {
    expect(() => createAiClient({ AI_PROVIDER: "claude" })).toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it("AI_PROVIDER=local は未実装エラー（未決事項#3）", () => {
    expect(() => createAiClient({ AI_PROVIDER: "local" })).toThrow(/未実装/);
  });

  it("不明なプロバイダ名はエラー", () => {
    expect(() => createAiClient({ AI_PROVIDER: "gpt" })).toThrow(/不明/);
  });
});

describe("MockAiClient", () => {
  it("最後のユーザー発言を含む定型応答を返す", async () => {
    const client = new MockAiClient();
    const result = await client.complete({
      system: "あなたはAI講師です",
      messages: [{ role: "user", content: "forぶんとは？" }],
    });
    expect(result.content).toContain("forぶんとは？");
    expect(result.model).toBe("mock-v1");
  });

  it("中断済みシグナルを渡すと推論せずAbortErrorを投げる（サーバー側キャンセル）", async () => {
    const client = new MockAiClient();
    const controller = new AbortController();
    controller.abort();
    await expect(
      client.complete({
        system: "s",
        messages: [{ role: "user", content: "q" }],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
