import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI ledger unknown cost semantics", () => {
  it("permits null estimated cost for unpriced provider usage", () => {
    expect(migration).toContain("estimated_cost_usd numeric(14, 8)");
    expect(migration).toContain("estimated_cost_usd is null");
  });
});
