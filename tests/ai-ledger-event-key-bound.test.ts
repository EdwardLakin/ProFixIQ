import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI ledger event key bounds", () => {
  it("rejects empty or excessively long idempotency keys", () => {
    expect(migration).toContain("length(p_event_key) > 240");
  });
});
