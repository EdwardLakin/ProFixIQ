import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: vi.fn(),
}));
vi.mock("@/features/stripe/lib/stripe/client", () => ({
  createStripeClient: vi.fn(),
}));

import { resolveEquipmentAddonEntitlement } from "@/features/equipment/server/equipmentAddonEntitlement";

function sub(
  status: string,
  items: Array<{
    lookupKey: string;
    metadata?: Record<string, string>;
    quantity?: number;
  }>,
  metadata: Record<string, string> = {},
): Stripe.Subscription {
  return {
    status,
    metadata,
    items: {
      data: items.map((item) => ({
        quantity: item.quantity ?? 1,
        price: { lookup_key: item.lookupKey, metadata: item.metadata ?? {} },
      })),
    },
  } as unknown as Stripe.Subscription;
}

const EQUIPMENT_BASE = {
  lookupKey: "profixiq_equipment_operations_monthly_usd_v1",
  metadata: { package_key: "equipment_operations" },
};
const COMPLETE_BASE = {
  lookupKey: "profixiq_complete_operations_monthly_usd_v2",
  metadata: { package_key: "complete_operations" },
};
const ADDON = {
  lookupKey: "profixiq_equipment_addon_monthly_usd_v1",
  metadata: { product_key: "equipment_addon" },
};

describe("Equipment entitlement: standalone package and legacy add-on bridge", () => {
  it("enables a standalone Equipment Operations subscription", () => {
    const result = resolveEquipmentAddonEntitlement(
      sub("active", [EQUIPMENT_BASE], { package_key: "equipment_operations" }),
    );
    expect(result).toMatchObject({
      enabled: true,
      hasStandaloneEquipmentItem: true,
      hasAddonItem: false,
      packageKey: "equipment_operations",
    });
  });

  it("honors trialing and past_due but not canceled or incomplete standalone subscriptions", () => {
    for (const status of ["trialing", "past_due"]) {
      expect(
        resolveEquipmentAddonEntitlement(sub(status, [EQUIPMENT_BASE])).enabled,
      ).toBe(true);
    }
    for (const status of ["canceled", "incomplete", "unpaid", "paused"]) {
      expect(
        resolveEquipmentAddonEntitlement(sub(status, [EQUIPMENT_BASE])).enabled,
      ).toBe(false);
    }
  });

  it("keeps the legacy Complete plus add-on path working", () => {
    expect(
      resolveEquipmentAddonEntitlement(sub("active", [COMPLETE_BASE, ADDON]))
        .enabled,
    ).toBe(true);
  });

  it("still denies Complete without the add-on, the add-on without Complete, and other packages", () => {
    expect(
      resolveEquipmentAddonEntitlement(sub("active", [COMPLETE_BASE])).enabled,
    ).toBe(false);
    expect(
      resolveEquipmentAddonEntitlement(sub("active", [ADDON])).enabled,
    ).toBe(false);
    expect(
      resolveEquipmentAddonEntitlement(
        sub("active", [
          {
            lookupKey: "profixiq_shop_operations_monthly_usd_v2",
            metadata: { package_key: "shop_operations" },
          },
        ]),
      ).enabled,
    ).toBe(false);
  });

  it("ignores a zero-quantity standalone item", () => {
    expect(
      resolveEquipmentAddonEntitlement(
        sub("active", [{ ...EQUIPMENT_BASE, quantity: 0 }]),
      ).enabled,
    ).toBe(false);
  });
});
