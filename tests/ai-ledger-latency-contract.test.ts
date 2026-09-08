import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI ledger latency", () => {
  it("stores non-negative provider latency", () => {
    expect(migration).toContain("latency_ms integer not null default 0");
    expect(migration).toContain("check (latency_ms >= 0)");
  });
});
