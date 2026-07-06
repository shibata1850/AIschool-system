import type { AiClient } from "./types";
import { MockAiClient } from "./mockClient";
import { ClaudeAiClient } from "./claudeClient";

export type { AiClient, AiCompletionRequest, AiCompletionResult, AiMessage } from "./types";

/**
 * 環境変数 AI_PROVIDER に従って推論クライアントを生成する。
 * - mock（既定）: 外部通信なし。開発・E2E用
 * - claude: Claude API（ANTHROPIC_API_KEY 必須）
 * - local: 校内GPUサーバーのローカルLLM（未実装 — 未決事項#3確定後に追加）
 */
export function createAiClient(
  env: Record<string, string | undefined> = process.env,
): AiClient {
  const provider = env.AI_PROVIDER ?? "mock";

  switch (provider) {
    case "mock":
      return new MockAiClient();
    case "claude":
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error(
          "AI_PROVIDER=claude には ANTHROPIC_API_KEY の設定が必要です（.env.example 参照）",
        );
      }
      return new ClaudeAiClient({
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.ANTHROPIC_MODEL,
      });
    case "local":
      throw new Error(
        "ローカルLLMクライアントは未実装です（docs/未決事項.md #3 の確定後に実装）",
      );
    default:
      throw new Error(`不明な AI_PROVIDER です: ${provider}`);
  }
}
