import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI ledger user dimension", () => {
  it("retains shop and user dimensions needed for per-technician economics", () => {
    expect(migration).toContain("shop_id uuid");
    expect(migration).toContain("user_id uuid");
  });
});
