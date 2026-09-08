import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const telemetry = readFileSync(
  "features/shared/lib/server/ai-telemetry.ts",
  "utf8",
);

describe("AI telemetry accounting", () => {
  it("uses the versioned model-aware rate card for text usage", () => {
    expect(telemetry).toContain("estimateOpenAITextCostUsd");
    expect(telemetry).toContain("AI_RATE_CARD_VERSION");
    expect(telemetry).toContain("cached_prompt_tokens");
  });

  it("does not fall back to the old blended token estimator for ledger cost", () => {
    expect(telemetry).not.toContain("estimateAICostUsd");
    expect(telemetry).not.toContain("AI_COST_PER_1K_TOKENS_DEFAULT");
  });
});
