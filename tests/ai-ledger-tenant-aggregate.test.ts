import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI tenant cost reporting", () => {
  it("can aggregate durable usage by shop and feature over time", () => {
    expect(migration).toContain("ai_usage_ledger_shop_month_idx");
    expect(migration).toContain("ai_usage_ledger_feature_month_idx");
  });
});
