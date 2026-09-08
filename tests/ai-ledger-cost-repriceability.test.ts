import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI ledger repriceability", () => {
  it("retains raw usage plus rate-card version instead of cost alone", () => {
    expect(migration).toContain("rate_card_version");
    expect(migration).toContain("prompt_tokens");
    expect(migration).toContain("cached_prompt_tokens");
    expect(migration).toContain("completion_tokens");
    expect(migration).toContain("estimated_cost_usd");
  });
});
