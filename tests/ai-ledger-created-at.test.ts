import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI ledger timestamps", () => {
  it("stores provider occurrence and durable creation timestamps", () => {
    expect(migration).toContain("occurred_at timestamptz not null");
    expect(migration).toContain("created_at timestamptz not null");
  });
});
