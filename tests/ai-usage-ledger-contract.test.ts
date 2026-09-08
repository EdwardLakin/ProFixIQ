import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("private AI usage ledger migration", () => {
  it("keeps the raw ledger private and service-role writer only", () => {
    expect(migration).toContain("create table private.ai_usage_ledger");
    expect(migration).toContain("revoke all privileges on table private.ai_usage_ledger");
    expect(migration).toContain("grant execute on function public.record_ai_usage_ledger");
    expect(migration).toContain("to service_role");
  });

  it("records rate-card and provider-level dedupe metadata", () => {
    expect(migration).toContain("rate_card_version");
    expect(migration).toContain("provider_request_id");
    expect(migration).toContain("event_key text not null unique");
    expect(migration).toContain("ai_usage_ledger_provider_request_unique_idx");
  });

  it("validates shop/user tenant consistency in the writer", () => {
    expect(migration).toContain("profile.shop_id = p_shop_id");
    expect(migration).toContain("AI_USAGE_LEDGER_USER_SCOPE_INVALID");
  });
});
