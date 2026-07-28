import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260728032500_fix_stripe_webhook_attempt_count.sql",
  ),
  "utf8",
);

describe("P1-012 Stripe webhook receipt SQL contract", () => {
  it("qualifies receipt counters that can collide with table-returning output names", () => {
    expect(migration).toContain(
      "update private.stripe_webhook_event_receipts as receipt",
    );
    expect(migration).toContain(
      "attempt_count = receipt.attempt_count + 1",
    );
    expect(migration).toContain(
      "delivery_count = receipt.delivery_count + 1",
    );
    expect(migration).toContain("where receipt.event_id = p_event_id");
    expect(migration).toContain("returning receipt.* into v_receipt");
    expect(migration).not.toContain("attempt_count = attempt_count + 1");
  });

  it("preserves the service-only security boundary", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain(
      "set search_path = pg_catalog, public, private",
    );
    expect(migration).toContain(
      "from public, anon, authenticated",
    );
    expect(migration).toContain("to service_role");
  });
});
