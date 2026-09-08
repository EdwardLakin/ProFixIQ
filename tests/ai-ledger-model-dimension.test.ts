import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI ledger model dimension", () => {
  it("retains provider and model so usage can be reconciled and repriced", () => {
    expect(migration).toContain("provider text not null");
    expect(migration).toContain("model text");
  });
});
