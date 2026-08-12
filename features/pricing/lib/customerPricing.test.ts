import { describe, expect, it } from "vitest";
import {
  CUSTOMER_PRICING_PRECEDENCE,
  resolveCustomerPricing,
  selectEffectiveCustomerPricingAgreement,
  type CustomerPricingAgreement,
} from "./customerPricing";

const customerRate: CustomerPricingAgreement = {
  id: "customer-rate",
  sourceType: "customer_specific",
  status: "active",
  currency: "CAD",
  laborRate: 120,
  laborDiscountPercent: 0,
  partsDiscountPercent: 5,
  effectiveFrom: "2026-01-01",
  effectiveUntil: null,
  createdAt: "2026-01-01T00:00:00Z",
};

describe("customer pricing precedence", () => {
  it("chooses a contract over a newer simple customer rate", () => {
    const agreement = selectEffectiveCustomerPricingAgreement({
      agreements: [
        customerRate,
        {
          ...customerRate,
          id: "fleet-contract",
          sourceType: "fleet_contract",
          laborRate: 105,
          createdAt: "2025-12-01T00:00:00Z",
        },
      ],
      at: "2026-08-12T00:00:00Z",
    });

    expect(agreement?.id).toBe("fleet-contract");
  });

  it("ignores retired, future, and expired agreements", () => {
    const agreement = selectEffectiveCustomerPricingAgreement({
      agreements: [
        { ...customerRate, id: "retired", status: "retired" },
        {
          ...customerRate,
          id: "future",
          effectiveFrom: "2026-09-01",
        },
        {
          ...customerRate,
          id: "expired",
          effectiveUntil: "2026-07-31",
        },
      ],
      at: "2026-08-12T00:00:00Z",
    });

    expect(agreement).toBeNull();
  });

  it("applies fixed labor and parts discounts without touching cost", () => {
    const resolution = resolveCustomerPricing({
      agreements: [customerRate],
      at: "2026-08-12T00:00:00Z",
      currency: "CAD",
      laborHours: 2.5,
      baseLaborRate: 150,
      basePartsTotal: 400,
    });

    expect(resolution).toMatchObject({
      sourceType: "customer_specific",
      precedenceRank: CUSTOMER_PRICING_PRECEDENCE.customer_specific,
      resolvedLaborRate: 120,
      resolvedLaborTotal: 300,
      resolvedPartsTotal: 380,
    });
  });

  it("accepts only an approved and attributed manual override", () => {
    const unapproved = resolveCustomerPricing({
      agreements: [customerRate],
      manualOverride: {
        approved: true,
        approvedBy: null,
        reason: "Goodwill",
        laborRate: 80,
      },
      at: "2026-08-12T00:00:00Z",
      currency: "CAD",
      laborHours: 2,
      baseLaborRate: 150,
      basePartsTotal: 100,
    });
    const approved = resolveCustomerPricing({
      agreements: [customerRate],
      manualOverride: {
        approved: true,
        approvedBy: "owner-user-id",
        reason: "Written contract exception",
        laborRate: 80,
        partsTotal: 70,
      },
      at: "2026-08-12T00:00:00Z",
      currency: "CAD",
      laborHours: 2,
      baseLaborRate: 150,
      basePartsTotal: 100,
    });

    expect(unapproved.sourceType).toBe("customer_specific");
    expect(approved).toMatchObject({
      sourceType: "manual_override",
      precedenceRank: CUSTOMER_PRICING_PRECEDENCE.manual_override,
      resolvedLaborRate: 80,
      resolvedLaborTotal: 160,
      resolvedPartsTotal: 70,
    });
  });
});
