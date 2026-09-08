import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI ledger status contract", () => {
  it("accepts only success/error provider outcomes", () => {
    expect(migration).toContain("status text not null check (status in ('success', 'error'))");
  });
});
