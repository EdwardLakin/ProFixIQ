import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI ledger cost nullability", () => {
  it("does not require a fabricated cost for unpriced usage", () => {
    expect(migration).toContain("estimated_cost_usd numeric(14, 8)");
  });
});
