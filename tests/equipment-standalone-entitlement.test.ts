import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  shop: null as null | Record<string, unknown>,
  rpc: vi.fn(),
  retrieve: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: mocks.shop, error: null }) }),
      }),
    }),
    rpc: mocks.rpc,
  }),
}));
vi.mock("@/features/stripe/lib/stripe/client", () => ({
  createStripeClient: () => ({ subscriptions: { retrieve: mocks.retrieve } }),
}));

import {
  resolveEquipmentAddonEntitlement,
  resolveEquipmentAddonEntitlementForShop,
} from "@/features/equipment/server/equipmentAddonEntitlement";

const SHOP_ID = "10000000-0000-4000-8000-000000000001";

function shop(overrides: Record<string, unknown> = {}) {
  return {
    id: SHOP_ID,
    stripe_customer_id: "cus_1",
    stripe_subscription_id: "sub_1",
    billing_entitlement_override: null,
    subscription_package: null,
    stripe_subscription_status: "active",
    ...overrides,
  };
}

function sub(
  status: string,
  items: Array<{ lookupKey: string; metadata?: Record<string, string> }>,
): Stripe.Subscription {
  return {
    status,
    customer: "cus_1",
    metadata: { shop_id: SHOP_ID },
    items: {
      data: items.map((item) => ({
        quantity: 1,
        price: { lookup_key: item.lookupKey, metadata: item.metadata ?? {} },
      })),
    },
  } as unknown as Stripe.Subscription;
}

const COMPLETE = {
  lookupKey: "profixiq_complete_operations_monthly_usd_v2",
  metadata: { package_key: "complete_operations" },
};
const ADDON = {
  lookupKey: "profixiq_equipment_addon_monthly_usd_v1",
  metadata: { product_key: "equipment_addon" },
};

describe("Equipment entitlement: standalone package uses the canonical capability", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
    mocks.rpc.mockReset();
    mocks.retrieve.mockReset();
  });

  it("enables a standalone shop when the canonical 'equipment' capability is true", async () => {
    mocks.shop = shop({ subscription_package: "equipment_operations" });
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    const result = await resolveEquipmentAddonEntitlementForShop(SHOP_ID);

    expect(mocks.rpc).toHaveBeenCalledWith("profixiq_shop_has_product_access", {
      p_shop_id: SHOP_ID,
      p_capability: "equipment",
    });
    expect(result).toMatchObject({
      enabled: true,
      hasStandaloneEquipmentItem: true,
      packageKey: "equipment_operations",
    });
    // Status, grace and overrides come from the canonical function, not Stripe.
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("honors a grace period or billing override the canonical function grants, with no subscription id", async () => {
    mocks.shop = shop({
      subscription_package: "equipment_operations",
      stripe_subscription_id: null,
      billing_entitlement_override: "active",
      stripe_subscription_status: "canceled",
    });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect((await resolveEquipmentAddonEntitlementForShop(SHOP_ID)).enabled).toBe(true);
  });

  it("denies when the canonical function denies (lapsed, suspended, read-only)", async () => {
    mocks.shop = shop({ subscription_package: "equipment_operations" });
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await resolveEquipmentAddonEntitlementForShop(SHOP_ID)).enabled).toBe(false);
  });

  it("fails closed when the canonical function errors", async () => {
    mocks.shop = shop({ subscription_package: "equipment_operations" });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(resolveEquipmentAddonEntitlementForShop(SHOP_ID)).rejects.toThrow("boom");
  });

  it("never asks the canonical function for non-Equipment shops, so legacy shops get no free Equipment", async () => {
    mocks.shop = shop({ subscription_package: null });
    mocks.retrieve.mockResolvedValue(sub("active", [COMPLETE]));
    const result = await resolveEquipmentAddonEntitlementForShop(SHOP_ID);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result.enabled).toBe(false);
  });

  it("keeps the internal demo override ahead of everything", async () => {
    mocks.shop = shop({
      subscription_package: "equipment_operations",
      billing_entitlement_override: "internal_demo",
    });
    const result = await resolveEquipmentAddonEntitlementForShop(SHOP_ID);
    expect(result.enabled).toBe(true);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("Equipment entitlement: legacy Complete plus add-on bridge is unchanged", () => {
  it("enables Complete plus the add-on while entitled", () => {
    expect(resolveEquipmentAddonEntitlement(sub("active", [COMPLETE, ADDON])).enabled).toBe(true);
    expect(resolveEquipmentAddonEntitlement(sub("trialing", [COMPLETE, ADDON])).enabled).toBe(true);
    expect(resolveEquipmentAddonEntitlement(sub("canceled", [COMPLETE, ADDON])).enabled).toBe(false);
  });

  it("denies Complete without the add-on and the add-on without Complete", () => {
    expect(resolveEquipmentAddonEntitlement(sub("active", [COMPLETE])).enabled).toBe(false);
    expect(resolveEquipmentAddonEntitlement(sub("active", [ADDON])).enabled).toBe(false);
  });

  it("does not let a standalone Equipment price item grant access outside the canonical path", () => {
    const standalone = {
      lookupKey: "profixiq_equipment_operations_monthly_usd_v1",
      metadata: { package_key: "equipment_operations" },
    };
    expect(resolveEquipmentAddonEntitlement(sub("active", [standalone])).enabled).toBe(false);
  });
});
