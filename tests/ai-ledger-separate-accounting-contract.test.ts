import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI accounting source of truth", () => {
  it("does not mutate the existing ai_route_usage_receipts table", () => {
    expect(migration).not.toContain("alter table private.ai_route_usage_receipts");
    expect(migration).not.toContain("drop table private.ai_route_usage_receipts");
  });
});
