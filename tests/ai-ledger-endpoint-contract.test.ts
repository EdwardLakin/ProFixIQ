import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI ledger endpoint attribution", () => {
  it("requires an endpoint for every durable event", () => {
    expect(migration).toContain("endpoint text not null");
  });
});
