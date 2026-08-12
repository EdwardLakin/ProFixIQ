import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260812022359_customer_specific_pricing_engine.sql",
  "utf8",
);
const roleNormalizerGrant = readFileSync(
  "supabase/migrations/20260812061000_restore_authenticated_role_normalizer.sql",
  "utf8",
);
const quoteReview = readFileSync(
  "features/work-orders/quote-review/QuoteReviewView.tsx",
  "utf8",
);
const quoteSend = readFileSync("app/api/quotes/send/route.ts", "utf8");

describe("customer-specific pricing engine contracts", () => {
  it("keeps precedence fixed and agreement history versioned", () => {
    expect(migration).toContain("when 'fleet_contract' then 800");
    expect(migration).toContain("when 'customer_contract' then 800");
    expect(migration).toContain("when 'customer_specific' then 700");
    expect(migration).not.toContain("priority integer");
    expect(migration).toContain(
      "CUSTOMER_PRICING_AGREEMENT_TERMS_REQUIRE_A_NEW_VERSION",
    );
  });

  it("freezes labor and canonical part sell prices without using cost", () => {
    expect(migration).toContain("set quoted_price = v_resolved_sell");
    expect(migration).toContain("unit_price = v_resolved_sell");
    expect(migration).not.toContain("unit_cost = v_resolved_sell");
    expect(migration).toContain(
      "CUSTOMER_PRICING_REQUIRES_CANONICAL_PART_ITEMS",
    );
    expect(migration).toContain("PRICING_RESOLUTION_SNAPSHOTS_ARE_IMMUTABLE");
  });

  it("resolves before staff review saves and before quote delivery", () => {
    expect(quoteReview).toContain(
      "`/api/work-orders/${woId}/customer-pricing`",
    );
    expect(quoteSend).toContain("apply_customer_pricing_to_quote_atomic");
    expect(
      quoteSend.indexOf("apply_customer_pricing_to_quote_atomic"),
    ).toBeLessThan(quoteSend.indexOf('from("work_order_quote_lines")'));
  });

  it("allows authenticated security-invoker pricing reads to normalize roles", () => {
    expect(roleNormalizerGrant).toContain(
      "grant execute on function public.canonical_shop_membership_role(text)",
    );
    expect(roleNormalizerGrant).toContain("to authenticated, service_role");
    expect(roleNormalizerGrant).toContain("from public, anon");
  });
});
