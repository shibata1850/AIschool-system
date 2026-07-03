import Anthropic from "@anthropic-ai/sdk";
import type { AiClient, AiCompletionRequest, AiCompletionResult } from "./types";

const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_MAX_TOKENS = 2048;

/**
 * Claude API 実装（未決事項#3の【仮】採用基盤）。
 * 個人情報の送信前マスキング（F2例外4）は呼び出し側のフィルタ層で行い、
 * 本クライアントはマスキング済みテキストのみを受け取る前提。
 */
export class ClaudeAiClient implements AiClient {
  readonly provider = "claude" as const;
  private client: Anthropic;
  private model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.client = new Anthropic(
      options?.apiKey ? { apiKey: options.apiKey } : undefined,
    );
    this.model = options?.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: request.system,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    return { content: text, model: response.model };
  }
}
