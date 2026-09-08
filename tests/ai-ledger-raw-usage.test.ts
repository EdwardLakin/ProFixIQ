import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI ledger raw usage retention", () => {
  it("stores raw provider units independently from calculated cost", () => {
    for (const field of [
      "prompt_tokens",
      "cached_prompt_tokens",
      "completion_tokens",
      "total_tokens",
      "audio_input_tokens",
      "audio_output_tokens",
      "speech_characters",
      "duration_seconds",
      "estimated_cost_usd",
    ]) {
      expect(migration).toContain(field);
    }
  });
});
