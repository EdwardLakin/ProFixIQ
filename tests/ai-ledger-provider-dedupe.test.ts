import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI provider request dedupe", () => {
  it("prevents duplicate provider request accounting per feature", () => {
    expect(migration).toContain("create unique index ai_usage_ledger_provider_request_unique_idx");
    expect(migration).toContain("provider_request_id");
    expect(migration).toContain("on conflict do nothing");
  });
});
