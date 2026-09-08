import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cost = readFileSync(
  "features/shared/lib/server/ai-cost.ts",
  "utf8",
);

describe("AI provider rate version", () => {
  it("pins the accounting snapshot to a dated OpenAI rate-card identifier", () => {
    expect(cost).toContain('AI_RATE_CARD_VERSION = "openai-2026-09-08-v1"');
  });
});
