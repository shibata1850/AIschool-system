import type { AiClient, AiCompletionRequest, AiCompletionResult } from "./types";

/**
 * 開発・E2Eテスト用のモッククライアント。
 * 外部通信を行わないため、実個人情報の流出リスクなしにテストできる。
 */
export class MockAiClient implements AiClient {
  readonly provider = "mock" as const;

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const lastUser = [...request.messages]
      .reverse()
      .find((m) => m.role === "user");
    return {
      content: `（テスト応答）「${lastUser?.content ?? ""}」という質問を受け取りました。`,
      model: "mock-v1",
    };
  }
}
