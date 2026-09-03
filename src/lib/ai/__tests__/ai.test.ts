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

describe("既定モデル（本番設定との一致）", () => {
  /**
   * 本番（さくら）は ANTHROPIC_MODEL=claude-haiku-4-5-20251001 を明示している。
   * コード側の既定値がこれと違うと、`.env` から ANTHROPIC_MODEL が落ちた際に
   * 応答時間とコストが黙って変わり、受け入れ基準F2①（応答5秒以内）を
   * 満たさなくなる可能性がある（2026-09-02に確認して揃えた）。
   */
  it("ANTHROPIC_MODEL 未設定でも本番と同じモデルを使う", () => {
    const client = createAiClient({
      AI_PROVIDER: "claude",
      ANTHROPIC_API_KEY: "test-key",
      ANTHROPIC_MODEL: undefined,
    }) as unknown as { model: string };
    expect(client.model).toBe("claude-haiku-4-5-20251001");
  });

  it("ANTHROPIC_MODEL を指定すればそちらが優先される", () => {
    const client = createAiClient({
      AI_PROVIDER: "claude",
      ANTHROPIC_API_KEY: "test-key",
      ANTHROPIC_MODEL: "claude-sonnet-5",
    }) as unknown as { model: string };
    expect(client.model).toBe("claude-sonnet-5");
  });
});
