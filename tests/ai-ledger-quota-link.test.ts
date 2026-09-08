import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI ledger quota linkage", () => {
  it("can link accounting rows to durable quota receipts without coupling them", () => {
    expect(migration).toContain("quota_receipt_id uuid");
    expect(migration).toContain("ai_usage_ledger_quota_receipt_idx");
  });
});
