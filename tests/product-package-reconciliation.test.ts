import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import { reconcileProductPackageSubscription } from "../features/stripe/lib/server/product-package-reconciliation";
import type { ProductPackagePriceContract } from "../features/stripe/lib/server/product-package-price-contract";
import type { ProductPackageKey } from "../features/stripe/lib/stripe/product-packages";

const SHOP_ID = "10000000-0000-4000-8000-000000000001";

const priceContract: ProductPackagePriceContract = {
  packagePriceIds: {
    shop_operations: "price_usd_shop",
    field_service: "price_usd_field",
    fleet_maintenance: "price_usd_fleet",
    complete_operations: "price_usd_complete",
  },
  additionalUserPriceId: "price_usd_user",
  additionalServiceTruckPriceId: "price_usd_truck",
  additionalFleetAssetPriceId: "price_usd_asset",
  legacyCad: {
    packagePriceIds: {
      shop_operations: "price_cad_shop",
      field_service: "price_cad_field",
      fleet_maintenance: "price_cad_fleet",
      complete_operations: "price_cad_complete",
    },
    additionalServiceTruckPriceId: "price_cad_truck",
    additionalFleetAssetPriceId: "price_cad_asset",
  },
};

function item(input: {
  id: string;
  priceId: string;
  lookupKey: string;
  quantity?: number;
}): Stripe.SubscriptionItem {
  return {
    id: input.id,
    quantity: input.quantity ?? 1,
    price: {
      id: input.priceId,
      lookup_key: input.lookupKey,
    },
  } as Stripe.SubscriptionItem;
}

function subscription(
  packageKey: ProductPackageKey,
  items: Stripe.SubscriptionItem[],
): Stripe.Subscription {
  return {
    id: `sub_${packageKey}`,
    status: "active",
    metadata: { package_key: packageKey },
    current_period_start: 1_786_406_400,
    items: { data: items },
  } as unknown as Stripe.Subscription;
}

function supabaseFixture(input: {
  packageKey: ProductPackageKey;
  activeUsers: number;
  nonStaffRoles?: string[];
  activeServiceTrucks: number;
  fleetAssetCounts: number[];
}) {
  const updates: unknown[] = [];
  const fleetIds = input.fleetAssetCounts.map((_, index) => `fleet-${index}`);
  const fleetVehicles = input.fleetAssetCounts.flatMap((count, index) =>
    Array.from({ length: count }, () => ({ fleet_id: fleetIds[index] })),
  );
  // Staff rows carry a real workforce role. Fleet-portal invitees and
  // shop-provisioned dispatcher/driver accounts live in the same `profiles`
  // table under a non-workforce role and must never be billed as a seat.
  const shopProfiles = [
    ...Array.from({ length: input.activeUsers }, () => ({ role: "owner" })),
    ...(input.nonStaffRoles ?? []).map((role) => ({ role })),
  ];
  let generation = 0;

  const from = vi.fn((table: string) => {
    let updatePayload: unknown;
    const result = () => {
      if (updatePayload !== undefined) {
        updates.push(updatePayload);
        return { data: null, error: null };
      }
      if (table === "profiles") {
        return { data: shopProfiles, error: null };
      }
      if (table === "service_vehicles") {
        return { count: input.activeServiceTrucks, data: null, error: null };
      }
      if (table === "fleets") {
        return { data: fleetIds.map((id) => ({ id })), error: null };
      }
      if (table === "fleet_vehicles") {
        return { data: fleetVehicles, error: null };
      }
      return { data: null, error: null };
    };
    const query = {
      select: () => query,
      eq: () => query,
      in: () => query,
      update: (payload: unknown) => {
        updatePayload = payload;
        return query;
      },
      maybeSingle: async () => ({
        data: {
          id: SHOP_ID,
          stripe_subscription_id: `sub_${input.packageKey}`,
          stripe_subscription_status: "active",
          stripe_pricing_model: "product_packages_v1",
          subscription_package: input.packageKey,
        },
        error: null,
      }),
      then: (
        resolve: (value: ReturnType<typeof result>) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(result()).then(resolve, reject),
    };
    return query;
  });
  const rpc = vi.fn(async (name: string) => {
    if (name !== "advance_billing_reconciliation_generation") {
      throw new Error(`Unexpected rpc call: ${name}`);
    }
    generation += 1;
    return { data: generation, error: null };
  });

  return { client: { from, rpc } as never, updates };
}

describe("product package subscription reconciliation", () => {
  it("bills Fleet Maintenance only for active assets above ten on the USD catalog", async () => {
    const supabase = supabaseFixture({
      packageKey: "fleet_maintenance",
      activeUsers: 4,
      activeServiceTrucks: 0,
      fleetAssetCounts: [8, 5],
    });
    const current = subscription("fleet_maintenance", [
      item({
        id: "si_base",
        priceId: "price_usd_fleet",
        lookupKey: "profixiq_fleet_maintenance_monthly_usd_v2",
      }),
    ]);
    const update = vi.fn().mockResolvedValue(current);

    const result = await reconcileProductPackageSubscription({
      stripe: {
        subscriptions: {
          retrieve: vi.fn().mockResolvedValue(current),
          update,
        },
      } as never,
      supabase: supabase.client,
      shopId: SHOP_ID,
      priceContract,
    });

    expect(result).toMatchObject({
      state: "updated",
      active_users: 4,
      additional_user_quantity: 0,
      active_fleet_assets: 13,
      additional_fleet_asset_quantity: 3,
      additional_service_truck_quantity: 0,
      estimated_monthly_price: 156.5,
      proration_behavior: "always_invoice",
    });
    expect(update).toHaveBeenCalledWith(
      current.id,
      expect.objectContaining({
        items: [{ price: "price_usd_asset", quantity: 3 }],
        proration_behavior: "always_invoice",
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringContaining("profixiq:package-sync:"),
      }),
    );
  });

  it("bills Complete for staff above ten and truck capacity, never shop-managed fleet assets", async () => {
    const supabase = supabaseFixture({
      packageKey: "complete_operations",
      activeUsers: 13,
      activeServiceTrucks: 3,
      fleetAssetCounts: [12],
    });
    const current = subscription("complete_operations", [
      item({
        id: "si_base",
        priceId: "price_usd_complete",
        lookupKey: "profixiq_complete_operations_monthly_usd_v2",
      }),
    ]);
    const update = vi.fn().mockResolvedValue(current);

    const result = await reconcileProductPackageSubscription({
      stripe: {
        subscriptions: {
          retrieve: vi.fn().mockResolvedValue(current),
          update,
        },
      } as never,
      supabase: supabase.client,
      shopId: SHOP_ID,
      priceContract,
    });

    expect(result).toMatchObject({
      state: "updated",
      active_users: 13,
      included_users: 10,
      additional_user_quantity: 3,
      active_service_trucks: 3,
      active_fleet_assets: 12,
      additional_service_truck_quantity: 1,
      additional_fleet_asset_quantity: 0,
      oversized_complete_fleets: 1,
      estimated_monthly_price: 698,
    });
    expect(update).toHaveBeenCalledWith(
      current.id,
      expect.objectContaining({
        items: [
          { price: "price_usd_user", quantity: 3 },
          { price: "price_usd_truck", quantity: 1 },
        ],
        metadata: expect.objectContaining({
          billing_currency: "usd",
          billable_user_count: "13",
          additional_user_quantity: "3",
          oversized_complete_fleet_count: "1",
          additional_fleet_asset_quantity: "0",
        }),
      }),
      expect.any(Object),
    );
  });

  it("never bills Fleet-portal invitees as Shop staff seats", async () => {
    const supabase = supabaseFixture({
      packageKey: "shop_operations",
      activeUsers: 10,
      nonStaffRoles: Array.from({ length: 5 }, () => "fleet_manager"),
      activeServiceTrucks: 0,
      fleetAssetCounts: [],
    });
    const current = subscription("shop_operations", [
      item({
        id: "si_base",
        priceId: "price_usd_shop",
        lookupKey: "profixiq_shop_operations_monthly_usd_v2",
      }),
    ]);
    const update = vi.fn().mockResolvedValue(current);

    const result = await reconcileProductPackageSubscription({
      stripe: {
        subscriptions: {
          retrieve: vi.fn().mockResolvedValue(current),
          update,
        },
      } as never,
      supabase: supabase.client,
      shopId: SHOP_ID,
      priceContract,
    });

    // 10 real staff + 5 Fleet-portal invitees on the same shop must still
    // reconcile as exactly 10 included staff, not 15.
    expect(result).toMatchObject({
      state: "already_synced",
      active_users: 10,
      additional_user_quantity: 0,
      estimated_monthly_price: 299,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("never bills dispatcher or driver profiles provisioned by create-user as Shop staff seats", async () => {
    // app/api/admin/create-user/route.ts provisions "dispatcher" and
    // "driver" as accepted roles for a Shop/Complete tenant; neither is a
    // workforce staff role and neither may count toward the ten included
    // seats.
    const supabase = supabaseFixture({
      packageKey: "shop_operations",
      activeUsers: 10,
      nonStaffRoles: ["dispatcher", "driver"],
      activeServiceTrucks: 0,
      fleetAssetCounts: [],
    });
    const current = subscription("shop_operations", [
      item({
        id: "si_base",
        priceId: "price_usd_shop",
        lookupKey: "profixiq_shop_operations_monthly_usd_v2",
      }),
    ]);
    const update = vi.fn().mockResolvedValue(current);

    const result = await reconcileProductPackageSubscription({
      stripe: {
        subscriptions: {
          retrieve: vi.fn().mockResolvedValue(current),
          update,
        },
      } as never,
      supabase: supabase.client,
      shopId: SHOP_ID,
      priceContract,
    });

    expect(result).toMatchObject({
      state: "already_synced",
      active_users: 10,
      additional_user_quantity: 0,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("gives a Shop staff count that cycles back within one period a fresh idempotency key", async () => {
    // 11 -> 10 -> 11 active staff must not reproduce the first call's Stripe
    // idempotency key, or Stripe replays the first call's cached response
    // instead of executing the third transition.
    const noSeatItem = subscription("shop_operations", [
      item({
        id: "si_base",
        priceId: "price_usd_shop",
        lookupKey: "profixiq_shop_operations_monthly_usd_v2",
      }),
    ]);
    const withSeatItem = subscription("shop_operations", [
      noSeatItem.items.data[0]!,
      item({
        id: "si_user",
        priceId: "price_usd_user",
        lookupKey: "profixiq_additional_user_monthly_usd_v2",
        quantity: 1,
      }),
    ]);

    function fixtureFor(activeUsers: number, rpc: ReturnType<typeof vi.fn>) {
      const shopProfiles = Array.from({ length: activeUsers }, () => ({
        role: "owner",
      }));
      const from = vi.fn((table: string) => {
        const result = () => {
          if (table === "profiles") return { data: shopProfiles, error: null };
          if (table === "service_vehicles")
            return { count: 0, data: null, error: null };
          if (table === "fleets") return { data: [], error: null };
          if (table === "fleet_vehicles") return { data: [], error: null };
          return { data: null, error: null };
        };
        const query = {
          select: () => query,
          eq: () => query,
          in: () => query,
          update: () => query,
          maybeSingle: async () => ({
            data: {
              id: SHOP_ID,
              stripe_subscription_id: "sub_shop_operations",
              stripe_subscription_status: "active",
              stripe_pricing_model: "product_packages_v1",
              subscription_package: "shop_operations",
            },
            error: null,
          }),
          then: (
            resolve: (value: ReturnType<typeof result>) => unknown,
            reject: (reason: unknown) => unknown,
          ) => Promise.resolve(result()).then(resolve, reject),
        };
        return query;
      });
      return { from, rpc } as never;
    }

    // A single durable per-shop generation, mirroring
    // advance_billing_reconciliation_generation: bump only when the target
    // billing signature actually changes from the last persisted one.
    let signature: string | null = null;
    let generation = 0;
    const rpc = vi.fn(
      async (_name: string, args: { p_signature: string }) => {
        if (signature !== args.p_signature) {
          generation += 1;
          signature = args.p_signature;
        }
        return { data: generation, error: null };
      },
    );

    const firstUpdate = vi.fn().mockResolvedValue(withSeatItem);
    await reconcileProductPackageSubscription({
      stripe: {
        subscriptions: {
          retrieve: vi.fn().mockResolvedValue(noSeatItem),
          update: firstUpdate,
        },
      } as never,
      supabase: fixtureFor(11, rpc),
      shopId: SHOP_ID,
      priceContract,
    });
    const firstKey = firstUpdate.mock.calls[0]![2].idempotencyKey as string;

    const secondUpdate = vi.fn().mockResolvedValue(noSeatItem);
    await reconcileProductPackageSubscription({
      stripe: {
        subscriptions: {
          retrieve: vi.fn().mockResolvedValue(withSeatItem),
          update: secondUpdate,
        },
      } as never,
      supabase: fixtureFor(10, rpc),
      shopId: SHOP_ID,
      priceContract,
    });

    const thirdUpdate = vi.fn().mockResolvedValue(withSeatItem);
    const third = await reconcileProductPackageSubscription({
      stripe: {
        subscriptions: {
          retrieve: vi.fn().mockResolvedValue(noSeatItem),
          update: thirdUpdate,
        },
      } as never,
      supabase: fixtureFor(11, rpc),
      shopId: SHOP_ID,
      priceContract,
    });
    const thirdKey = thirdUpdate.mock.calls[0]![2].idempotencyKey as string;

    expect(third.state).toBe("updated");
    expect(thirdKey).not.toBe(firstKey);
  });

  it("preserves an existing CAD package instead of silently converting currency", async () => {
    const supabase = supabaseFixture({
      packageKey: "field_service",
      activeUsers: 3,
      activeServiceTrucks: 2,
      fleetAssetCounts: [],
    });
    const current = subscription("field_service", [
      item({
        id: "si_base",
        priceId: "price_cad_field",
        lookupKey: "profixiq_field_service_monthly_v1",
      }),
    ]);
    const updated = subscription("field_service", [
      current.items.data[0]!,
      item({
        id: "si_truck",
        priceId: "price_cad_truck",
        lookupKey: "profixiq_additional_service_truck_monthly_v1",
      }),
    ]);
    const update = vi.fn().mockResolvedValue(updated);

    const result = await reconcileProductPackageSubscription({
      stripe: {
        subscriptions: {
          retrieve: vi.fn().mockResolvedValue(current),
          update,
        },
      } as never,
      supabase: supabase.client,
      shopId: SHOP_ID,
      priceContract,
    });

    expect(result).toMatchObject({
      state: "updated",
      additional_user_quantity: 0,
      additional_service_truck_quantity: 1,
      reason: "legacy_cad_subscription_capacity_reconciled_without_currency_conversion",
    });
    expect(update).toHaveBeenCalledWith(
      current.id,
      expect.objectContaining({
        items: [{ price: "price_cad_truck", quantity: 1 }],
        metadata: expect.objectContaining({ billing_currency: "cad" }),
      }),
      expect.any(Object),
    );
  });

  it("repairs duplicate current-catalog primary package items without issuing a credit", async () => {
    const supabase = supabaseFixture({
      packageKey: "field_service",
      activeUsers: 2,
      activeServiceTrucks: 1,
      fleetAssetCounts: [],
    });
    const current = subscription("field_service", [
      item({
        id: "si_primary",
        priceId: "price_old_field",
        lookupKey: "profixiq_field_service_monthly_usd_v2",
      }),
      item({
        id: "si_duplicate",
        priceId: "price_usd_field",
        lookupKey: "profixiq_field_service_monthly_usd_v2",
      }),
    ]);
    const update = vi.fn().mockResolvedValue(current);

    const result = await reconcileProductPackageSubscription({
      stripe: {
        subscriptions: {
          retrieve: vi.fn().mockResolvedValue(current),
          update,
        },
      } as never,
      supabase: supabase.client,
      shopId: SHOP_ID,
      priceContract,
    });

    expect(result.proration_behavior).toBe("none");
    expect(update).toHaveBeenCalledWith(
      current.id,
      expect.objectContaining({
        items: [
          { id: "si_primary", price: "price_usd_field", quantity: 1 },
          { id: "si_duplicate", deleted: true },
        ],
        proration_behavior: "none",
      }),
      expect.any(Object),
    );
  });
});
