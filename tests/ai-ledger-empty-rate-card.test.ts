import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI rate-card validation", () => {
  it("rejects an empty rate-card version", () => {
    expect(migration).toContain("nullif(btrim(p_rate_card_version), '') is null");
  });
});
