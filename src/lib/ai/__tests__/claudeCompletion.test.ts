import { describe, expect, it, vi } from "vitest";
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create }; } }));
import { ClaudeAiClient } from "../claudeClient";

describe("Claude completion metadata", () => {
  it.each(["end_turn", "max_tokens", "refusal", null])("preserves stop reason %s without altering text", async stop_reason => {
    create.mockResolvedValue({model:"test", stop_reason, content:[{type:"text",text:"{}"}]});
    const result = await new ClaudeAiClient({apiKey:"test"}).complete({system:"test",messages:[],maxTokens:1200});
    expect(result).toEqual({model:"test",content:"{}",stopReason:stop_reason});
    expect(create.mock.calls.at(-1)?.[0].max_tokens).toBe(1200);
  });
});
