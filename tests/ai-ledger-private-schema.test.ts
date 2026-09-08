import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI ledger exposure", () => {
  it("keeps the ledger out of public schema", () => {
    expect(migration).toContain("create table private.ai_usage_ledger");
    expect(migration).not.toContain("create table public.ai_usage_ledger");
  });
});
