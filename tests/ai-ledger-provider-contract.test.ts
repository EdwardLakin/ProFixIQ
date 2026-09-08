import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI ledger provider contract", () => {
  it("currently accepts only the provider whose rate card is implemented", () => {
    expect(migration).toContain("<> 'openai'");
  });
});
