import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Quote Review quarantine database contract", () => {
  const migration = readFileSync(
    "supabase/migrations/20260807153950_repair_quote_review_cost_sell.sql",
    "utf8",
  );
  const runtime = readFileSync(
    "tests/security/quote-review-cost-and-sell.runtime.sql",
    "utf8",
  );

  it("builds the imported owner fixture through canonical identities", () => {
    const fixtureSetup = runtime.slice(
      0,
      runtime.indexOf("insert into public.customers"),
    );
    expect(fixtureSetup).toContain(
      "set user_id = '40100000-0000-4000-8000-000000000001'",
    );
    expect(fixtureSetup).toContain(
      "'40200000-0000-4000-8000-000000000001',\n" +
        "    '40100000-0000-4000-8000-000000000011',\n" +
        "    'Quote Cost Sell Shop A'",
    );
  });

  it("protects timestamp and customer-stage handoffs from resync", () => {
    const lockedEstimateFixture = runtime.slice(
      runtime.indexOf("Locked estimate legacy quote"),
      runtime.indexOf("Timestamp-only protected quote"),
    );
    expect(migration).toContain("public.quote_line_pricing_is_protected");
    expect(migration).toContain("p_sent_to_customer_at is not null");
    expect(migration).toContain("p_sent_at is not null");
    expect(migration).toContain("p_converted_at is not null");
    expect(migration).toContain("('sent', 'customer_review')");
    expect(migration).toContain("= 'customer_'");
    expect(runtime).toContain("Timestamp-only protected quote");
    expect(runtime).toContain("Stage-only protected quote");
    expect(runtime).toContain("Converted-at-only protected quote");
    expect(lockedEstimateFixture).toContain(
      "jsonb_build_object('labor_rate', 0)",
    );
  });

  it("quarantines snapshot-only and equal-sum item drift", () => {
    expect(migration).toContain("v_snapshot_only");
    expect(migration).toContain("v_has_item_drift");
    expect(migration).toContain("protected_snapshot_without_canonical_items");
    expect(migration).toContain("protected_item_pricing_mismatch");
    expect(runtime).toContain("Snapshot-only protected quote");
    expect(runtime).toContain("Equal-sum item drift protected quote");
  });

  it("enforces quarantine below API routes while preserving trusted remediation", () => {
    expect(migration).toContain("block_quarantined_quote_lifecycle");
    expect(migration).toContain("block_quarantined_quote_materialization");
    expect(migration).toContain("'quote_line:' || q.id::text");
    expect(migration).toContain(
      "block_quarantined_estimate_send_reservation",
    );
    expect(migration).toContain("v_trusted_remediation boolean");
    expect(migration).toContain("session_user = 'postgres'");
    expect(migration).toContain("request.jwt.claims");
    expect(migration).toContain("work_order_is_financially_locked");
    expect(migration).toContain("quote_financial_guard_state");
    expect(migration).toContain("jsonb_typeof(item.value) = 'object'");
    expect(runtime).toContain("Scalar historical quote item");
    expect(runtime).toContain("Non-object parts_quote");
    expect(runtime).toContain("Financially locked quote");
    expect(runtime).toContain(
      "Authenticated SECURITY DEFINER writer cleared quote pricing quarantine",
    );
    expect(runtime).toContain(
      "Same-shop authenticated actor cleared quote pricing quarantine",
    );
    expect(runtime).toContain(
      "Trusted postgres remediation could not clear quarantine",
    );
    expect(runtime).toContain(
      "External-id quarantined work-line materialization was not blocked",
    );
  });
});
