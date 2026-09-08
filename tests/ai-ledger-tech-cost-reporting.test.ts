import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("technician AI cost reporting", () => {
  it("indexes shop/user/occurred_at for monthly technician economics", () => {
    expect(migration).toContain("ai_usage_ledger_user_month_idx");
  });
});
