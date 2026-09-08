import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI ledger validation", () => {
  it("rejects negative usage and cost values", () => {
    expect(migration).toContain("coalesce(p_prompt_tokens, 0) < 0");
    expect(migration).toContain("coalesce(p_cached_prompt_tokens, 0) < 0");
    expect(migration).toContain("coalesce(p_estimated_cost_usd, 0) < 0");
  });
});
