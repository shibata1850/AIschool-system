/**
 * AI推論クライアントの抽象化レイヤー（CLAUDE.md 5章・未決事項#3）。
 * 推論基盤（Claude API / 校内GPUサーバーのローカルLLM）は本interfaceの実装として提供し、
 * 呼び出し側は環境変数 AI_PROVIDER の切替のみで基盤を変更できる。
 */

export type AiRole = "user" | "assistant";

export interface AiMessage {
  role: AiRole;
  content: string;
}

export interface AiCompletionRequest {
  /** AI講師の人格・制約を定義する指示文 */
  system: string;
  messages: AiMessage[];
  /** 応答の最大トークン数（既定: 2048） */
  maxTokens?: number;
}

export interface AiCompletionResult {
  content: string;
  /** 採点・応答の再現性確認用（監査・乖離分析に記録する） */
  model: string;
}

export interface AiClient {
  readonly provider: "mock" | "claude" | "local";
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
}
