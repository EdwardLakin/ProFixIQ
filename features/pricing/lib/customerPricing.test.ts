import { describe, expect, it } from "vitest";
import {
  CUSTOMER_PRICING_PRECEDENCE,
  contractExpiryStatus,
  resolveCustomerFee,
  resolveCustomerPricing,
  resolveV2PartPricing,
  selectEffectiveCustomerPricingAgreement,
  validatePartsMarkupMatrix,
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

describe("Pricing V2 rules", () => {
  const matrix = [
    { costFrom: 0, costTo: 49.99, markupPercent: 100 },
    { costFrom: 50, costTo: 199.99, markupPercent: 60 },
    { costFrom: 200, costTo: null, markupPercent: 35 },
  ];

  it("selects the cost band before applying a customer discount", () => {
    expect(validatePartsMarkupMatrix(matrix)).toBe(true);
    expect(
      resolveV2PartPricing({
        unitCost: 100,
        baseUnitPrice: 140,
        matrix,
        partsDiscountPercent: 10,
        minimumPartsMarginPercent: 20,
      }),
    ).toMatchObject({
      matrixMarkupPercent: 60,
      matrixUnitPrice: 160,
      discountedUnitPrice: 144,
      resolvedUnitPrice: 144,
      floorApplied: false,
      provenance: "matrix",
    });
  });

  it("protects the minimum parts margin after discounts", () => {
    expect(
      resolveV2PartPricing({
        unitCost: 100,
        baseUnitPrice: 110,
        matrix: [],
        partsDiscountPercent: 20,
        minimumPartsMarginPercent: 25,
      }),
    ).toMatchObject({
      discountedUnitPrice: 88,
      marginFloorUnitPrice: 133.33,
      resolvedUnitPrice: 133.33,
      floorApplied: true,
    });
  });

  it("does not invent margin evidence when cost is unknown", () => {
    expect(
      resolveV2PartPricing({
        unitCost: null,
        baseUnitPrice: 200,
        matrix,
        partsDiscountPercent: 5,
        minimumPartsMarginPercent: 30,
      }),
    ).toMatchObject({
      cost: null,
      matrixMarkupPercent: null,
      marginFloorUnitPrice: null,
      resolvedUnitPrice: 190,
      floorApplied: false,
      provenance: "base_sell",
    });
  });

  it("calculates capped flat and percentage customer fees", () => {
    expect(
      resolveCustomerFee({
        type: "percentage",
        value: 6,
        cap: 50,
        laborAndPartsSubtotal: 1000,
      }),
    ).toBe(50);
    expect(
      resolveCustomerFee({
        type: "flat",
        value: 32.5,
        laborAndPartsSubtotal: 1000,
      }),
    ).toBe(32.5);
  });

  it("classifies contract expiry using the agreement warning window", () => {
    expect(
      contractExpiryStatus({
        effectiveUntil: "2026-09-01",
        at: "2026-08-12T18:00:00Z",
        warningDays: 30,
      }),
    ).toBe("expiring_soon");
    expect(
      contractExpiryStatus({
        effectiveUntil: "2026-08-01",
        at: "2026-08-12T18:00:00Z",
        warningDays: 30,
      }),
    ).toBe("expired");
  });
});
