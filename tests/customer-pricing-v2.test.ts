import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260812140518_customer_pricing_v2.sql",
);
const customerRoute = read("app/api/customers/[id]/pricing/route.ts");
const workOrderRoute = read(
  "app/api/work-orders/[id]/customer-pricing/route.ts",
);
const accountPanel = read(
  "features/customers/components/CustomerPricingPanel.tsx",
);
const quoteReview = read(
  "features/work-orders/quote-review/QuoteReviewView.tsx",
);

describe("customer Pricing V2", () => {
  it("versions matrices, fees, margins, and expiry settings with agreements", () => {
    expect(migration).toContain("parts_markup_matrix jsonb");
    expect(migration).toContain("minimum_parts_margin_percent");
    expect(migration).toContain("customer_fee_type");
    expect(migration).toContain("expiry_warning_days");
    expect(migration).toContain(
      "drop constraint customer_pricing_agreements_has_adjustment",
    );
    expect(migration).toContain("jsonb_array_length(parts_markup_matrix) > 0");
    expect(migration).toContain("CUSTOMER_PRICING_AGREEMENT_TERMS_REQUIRE_A_NEW_VERSION");
  });

  it("keeps pricing writes atomic, tenant-scoped, and actor-attributed", () => {
    expect(migration).toContain("create_customer_pricing_agreement_v2_atomic");
    expect(migration).toContain("apply_customer_pricing_v2_to_quote_atomic");
    expect(migration).toContain("PRICING_ACTOR_MISMATCH");
    expect(migration).toContain("agreement.shop_id = p_shop_id");
    expect(migration).toContain("p_actor_user_id");
    expect(customerRoute).toContain(
      '"create_customer_pricing_agreement_v2_atomic"',
    );
    expect(workOrderRoute).toContain(
      '"apply_customer_pricing_v2_to_quote_atomic"',
    );
    expect(migration).toContain(
      "currently deployed application remains compatible",
    );
  });

  it("applies the matrix before discounts and the margin floor last", () => {
    const matrixPosition = migration.indexOf("v_matrix_unit_price :=");
    const discountPosition = migration.indexOf("v_discounted_unit_price :=");
    const floorPosition = migration.indexOf("v_margin_floor_unit_price :=");
    expect(matrixPosition).toBeGreaterThan(0);
    expect(discountPosition).toBeGreaterThan(matrixPosition);
    expect(floorPosition).toBeGreaterThan(discountPosition);
    expect(migration).toContain("greatest(\n          v_discounted_unit_price");
  });

  it("preserves immutable quote provenance and canonical customer fees", () => {
    expect(migration).toContain("supersedes_snapshot_id");
    expect(migration).toContain("customer_pricing_v2");
    expect(migration).toContain("margin_floor_adjustment_total");
    expect(migration).toContain("shop_supplies_amount_override = v_fee_total");
    expect(migration).toContain("customer_pricing_fee_agreement_id");
    expect(quoteReview).toContain("marginFloorAdjustmentTotal");
  });

  it("exposes usable controls and contract-expiry warnings in the account center", () => {
    expect(accountPanel).toContain("Parts matrix");
    expect(accountPanel).toContain("Minimum parts margin %");
    expect(accountPanel).toContain("Customer fee");
    expect(accountPanel).toContain("Expiry warning days");
    expect(accountPanel).toContain("Contract expiry:");
  });
});
