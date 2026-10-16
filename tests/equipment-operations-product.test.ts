import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import {
  EQUIPMENT_OPERATIONS_LOOKUP_KEY,
  EQUIPMENT_OPERATIONS_PRICING,
  estimateEquipmentOperationsMonthlyCents,
} from "@/features/equipment/lib/equipmentProduct";
import { resolveEquipmentOperationsPriceId } from "@/features/stripe/lib/server/equipment-operations-price-contract";
import {
  PRODUCT_PACKAGE_KEYS,
  PRODUCT_PACKAGE_PRICING,
} from "@/features/stripe/lib/stripe/product-packages";

function price(overrides: Record<string, unknown> = {}) {
  return {
    id: "price_equipment",
    active: true,
    lookup_key: EQUIPMENT_OPERATIONS_LOOKUP_KEY,
    currency: "usd",
    unit_amount: 39_900,
    type: "recurring",
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    metadata: {
      app: "profixiq",
      billing_model: "product_packages_v1",
      price_role: "base",
      package_key: "equipment_operations",
    },
    ...overrides,
  };
}

function stripeWith(data: unknown[]) {
  return {
    prices: { list: async () => ({ data }) },
  } as unknown as Stripe;
}

describe("Equipment Operations standalone product", () => {
  it("prices at $399 with 10 included users and $50 per additional user", () => {
    expect(EQUIPMENT_OPERATIONS_PRICING).toEqual({
      monthlyCents: 39_900,
      includedUsers: 10,
      additionalUserCents: 5_000,
    });
    expect(estimateEquipmentOperationsMonthlyCents(4)).toBe(39_900);
    expect(estimateEquipmentOperationsMonthlyCents(10)).toBe(39_900);
    expect(estimateEquipmentOperationsMonthlyCents(13)).toBe(54_900);
  });

  it("does not alter the shared package catalog", () => {
    expect([...PRODUCT_PACKAGE_KEYS]).toEqual([
      "shop_operations",
      "field_service",
      "fleet_maintenance",
      "complete_operations",
    ]);
    expect(PRODUCT_PACKAGE_PRICING.equipmentAddonCents).toBe(14_900);
  });

  it("resolves a valid Stripe price", async () => {
    await expect(
      resolveEquipmentOperationsPriceId(stripeWith([price()])),
    ).resolves.toBe("price_equipment");
  });

  it.each([
    ["missing", []],
    ["duplicate", [price(), price({ id: "price_dup" })]],
    ["wrong amount", [price({ unit_amount: 14_900 })]],
    ["wrong currency", [price({ currency: "cad" })]],
    ["wrong interval", [price({ recurring: { interval: "year", interval_count: 1, usage_type: "licensed" } })]],
    ["wrong metadata", [price({ metadata: { app: "profixiq", package_key: "shop_operations" } })]],
  ])("rejects a %s price", async (_name, data) => {
    await expect(
      resolveEquipmentOperationsPriceId(stripeWith(data)),
    ).rejects.toThrow();
  });
});
