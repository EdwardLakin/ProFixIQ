import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  estimateOpenAISpeechCostUsd,
  estimateOpenAITextCostUsd,
} from "@/features/shared/lib/server/ai-cost";

describe("AI ledger rate calculations", () => {
  it("prices GPT-5.5 input, cached input, and output separately", () => {
    expect(
      estimateOpenAITextCostUsd({
        model: "gpt-5.5",
        promptTokens: 1_000_000,
        cachedPromptTokens: 200_000,
        completionTokens: 100_000,
      }),
    ).toBe(7.1);
  });

  it("prices GPT-5.4-mini using its own rate card", () => {
    expect(
      estimateOpenAITextCostUsd({
        model: "gpt-5.4-mini",
        promptTokens: 1_000_000,
        cachedPromptTokens: 0,
        completionTokens: 100_000,
      }),
    ).toBe(1.2);
  });

  it("keeps cost unknown when provider usage is absent", () => {
    expect(
      estimateOpenAITextCostUsd({
        model: "gpt-5.5",
        promptTokens: null,
        completionTokens: null,
      }),
    ).toBeNull();
  });

  it("does not infer prompt totals from cached-token details alone", () => {
    expect(
      estimateOpenAITextCostUsd({
        model: "gpt-5.5",
        promptTokens: null,
        cachedPromptTokens: 10,
        completionTokens: null,
      }),
    ).toBeNull();
  });

  it("does not apply legacy character pricing to gpt-4o-mini-tts", () => {
    expect(estimateOpenAISpeechCostUsd("gpt-4o-mini-tts", 2_000)).toBeNull();
  });
});
