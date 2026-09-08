import { describe, expect, it } from "vitest";

import {
  AI_RATE_CARD_VERSION,
  estimateOpenAISpeechCostUsd,
  estimateOpenAITextCostUsd,
} from "@/features/shared/lib/server/ai-cost";

describe("AI cost accounting", () => {
  it("prices GPT-5.5 input, cached input, and output separately", () => {
    expect(
      estimateOpenAITextCostUsd("gpt-5.5", {
        promptTokens: 1_000_000,
        cachedPromptTokens: 400_000,
        completionTokens: 100_000,
      }),
    ).toBe(6.2);
  });

  it("prices GPT-5.4-mini with its own rate card", () => {
    expect(
      estimateOpenAITextCostUsd("gpt-5.4-mini", {
        promptTokens: 1_000_000,
        cachedPromptTokens: 0,
        completionTokens: 100_000,
      }),
    ).toBe(1.2);
  });

  it("returns null for an unknown model instead of inventing cost", () => {
    expect(
      estimateOpenAITextCostUsd("future-model", {
        promptTokens: 1_000,
        cachedPromptTokens: 0,
        completionTokens: 100,
      }),
    ).toBeNull();
  });

  it("prices tts-1 speech characters independently of token models", () => {
    expect(estimateOpenAISpeechCostUsd(1_000_000)).toBe(15);
  });

  it("carries an explicit rate-card version", () => {
    expect(AI_RATE_CARD_VERSION).toBe("openai-2026-09-08-v1");
  });
});
