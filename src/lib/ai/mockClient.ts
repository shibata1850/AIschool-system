import type { AiClient, AiCompletionRequest, AiCompletionResult } from "./types";

/** この文字列を含む質問は、モックでは推論失敗になる（E2E・受け入れ試験の障害模擬） */
export const OUTAGE_TRIGGER = "【障害模擬】";

/**
 * 開発・E2Eテスト用のモッククライアント。
 * 外部通信を行わないため、実個人情報の流出リスクなしにテストできる。
 */
export class MockAiClient implements AiClient {
  readonly provider = "mock" as const;

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    // 実クライアントと同様に中断シグナルを尊重する（呼び出し側の配線をテストできる）
    if (request.signal?.aborted) {
      throw new DOMException("推論が中断されました", "AbortError");
    }
    const lastUser = [...request.messages]
      .reverse()
      .find((m) => m.role === "user");
    // 推論基盤の停止を模擬する（受け入れ基準 F2②「推論基盤停止を模擬し」のE2E用）。
    // モックにしか無い経路なので、本番（claude）では何を書いても発動しない
    if (lastUser?.content.includes(OUTAGE_TRIGGER)) {
      throw new Error("モック: 推論基盤が停止しています");
    }
    return {
      content: `（テスト応答）「${lastUser?.content ?? ""}」という質問を受け取りました。`,
      model: "mock-v1",
    };
  }
}
