import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI provider request index", () => {
  it("only enforces provider request uniqueness when provider id exists", () => {
    expect(migration).toContain("where provider_request_id is not null");
  });
});
