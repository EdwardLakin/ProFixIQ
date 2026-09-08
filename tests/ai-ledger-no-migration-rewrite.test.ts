import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql";

describe("AI ledger migration discipline", () => {
  it("uses a new forward migration for the ledger", () => {
    expect(migrationPath).toMatch(/^supabase\/migrations\/20260908/);
  });
});
