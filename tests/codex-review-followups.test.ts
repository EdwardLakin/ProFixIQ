import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260807214202_address_parts_quote_review_followups.sql",
  "utf8",
);
const generatedTypes = readFileSync(
  "features/shared/types/types/supabase.ts",
  "utf8",
);
const quoteRuntime = readFileSync(
  "tests/security/quote-review-cost-and-sell.runtime.sql",
  "utf8",
);

describe("Codex review follow-up contracts", () => {
  it("keeps quarantine remediation service-only, audited, and idempotent", () => {
    expect(migration).toContain(
      "function public.remediate_quote_line_pricing_quarantine",
    );
    expect(migration).toContain("security invoker");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("QUOTE_PRICING_REMEDIATION_TOTAL_MISMATCH");
    expect(migration).toContain("quote_pricing_quarantine_remediation");
    expect(migration).toContain("quote.pricing_quarantine.remediated");
    expect(migration).toContain("open_work_order_correction_session");
    expect(migration).toContain("close_work_order_correction_session");
    expect(quoteRuntime).toContain("Pricing remediation exact replay");
    expect(quoteRuntime).toContain("changed durable decision state or totals");
    expect(generatedTypes).toContain(
      "remediate_quote_line_pricing_quarantine:",
    );
  });

  it("moves mutable orphan pricing back through canonical sync", () => {
    const backfill = migration.slice(
      migration.indexOf("-- Reconcile historical mutable quote lines"),
    );
    expect(backfill).toContain("not public.quote_line_pricing_is_protected");
    expect(backfill).toContain("not exists (");
    expect(backfill).toContain("join public.part_request_items item");
    expect(backfill).toContain("sync_quote_line_pricing_from_parts");
    expect(backfill).toContain("'quoted', 'ready_to_send'");
  });

  it("patches free-text receipt precision without replacing the deployed migration", () => {
    expect(migration).toContain("pg_get_functiondef");
    expect(migration).toContain("p_qty <> round(p_qty, 2)");
    expect(migration).toContain("PARTS_RECEIPT_QUANTITY_PRECISION");
  });
});
