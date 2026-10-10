import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migrationPath =
  "supabase/migrations/20261010205500_fix_portal_quote_approval_pricing_sync.sql";

describe("portal quote approval pricing sync regression", () => {
  it("skips protected customer quote pricing before invoking the staff-only sync", () => {
    const migration = read(migrationPath).toLowerCase();
    const protectedCheck = migration.indexOf("quote_line_pricing_is_protected");
    const protectedReturn = migration.indexOf(
      "if coalesce(v_pricing_protected, false) then",
    );
    const pricingSync = migration.indexOf(
      "perform public.sync_quote_line_pricing_from_parts",
    );

    expect(protectedCheck).toBeGreaterThan(-1);
    expect(protectedReturn).toBeGreaterThan(protectedCheck);
    expect(pricingSync).toBeGreaterThan(protectedReturn);
    expect(migration).toContain("security invoker");
  });

  it("keeps mutable quote pricing behind the existing authenticated-staff guard", () => {
    const canonicalPricing = read(
      "supabase/migrations/20260807153950_repair_quote_review_cost_sell.sql",
    );

    expect(canonicalPricing).toContain(
      "Quote pricing sync is limited to the authenticated staff shop.",
    );
    expect(canonicalPricing).toContain(
      "create or replace function public.sync_quote_line_pricing_from_parts",
    );
  });

  it("leaves portal decisions on the canonical atomic approval path", () => {
    const route = read(
      "app/api/work-orders/quotes/[id]/approval-decision/route.ts",
    );
    const helper = read(
      "features/work-orders/server/workOrderQuoteLineApproval.ts",
    );

    expect(route).toContain("requirePortalCustomerActor");
    expect(route).toContain("applyWorkOrderQuoteLineDecision");
    expect(helper).toContain('rpc("apply_portal_quote_decision_atomic"');
  });
});
