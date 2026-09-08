import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI ledger scope validation", () => {
  it("validates shop existence before accounting scoped usage", () => {
    expect(migration).toContain("AI_USAGE_LEDGER_SHOP_SCOPE_INVALID");
  });
});
