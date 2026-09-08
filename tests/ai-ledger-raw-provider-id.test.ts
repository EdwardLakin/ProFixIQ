import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("provider reconciliation identity", () => {
  it("retains provider request ids independently from application event keys", () => {
    expect(migration).toContain("provider_request_id text");
    expect(migration).toContain("event_key text not null unique");
  });
});
