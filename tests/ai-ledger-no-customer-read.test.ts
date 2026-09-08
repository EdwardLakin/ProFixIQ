import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("raw AI accounting access", () => {
  it("has no authenticated/anon table grants or user-facing RLS policy", () => {
    expect(migration).not.toContain("grant select on table private.ai_usage_ledger to authenticated");
    expect(migration).not.toContain("create policy");
  });
});
