import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import { reconcileProductPackageSubscription } from "../features/stripe/lib/server/product-package-reconciliation";
import type { ProductPackagePriceContract } from "../features/stripe/lib/server/product-package-price-contract";
import type { ProductPackageKey } from "../features/stripe/lib/stripe/product-packages";

const SHOP_ID = "10000000-0000-4000-8000-000000000001";

const priceContract: ProductPackagePriceContract = {
  packagePriceIds: {
    shop_operations: "price_shop",
    field_service: "price_field",
    fleet_maintenance: "price_fleet",
    complete_operations: "price_complete",
  },
  additionalServiceTruckPriceId: "price_truck",
  additionalFleetAssetPriceId: "price_asset",
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
  activeServiceTrucks: number;
  fleetAssetCounts: number[];
}) {
  const updates: unknown[] = [];
  const fleetIds = input.fleetAssetCounts.map((_, index) => `fleet-${index}`);
  const fleetVehicles = input.fleetAssetCounts.flatMap((count, index) =>
    Array.from({ length: count }, () => ({ fleet_id: fleetIds[index] })),
  );

  const from = vi.fn((table: string) => {
    let updatePayload: unknown;
    const result = () => {
      if (updatePayload !== undefined) {
        updates.push(updatePayload);
        return { data: null, error: null };
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

  return { client: { from } as never, updates };
}

describe("product package subscription reconciliation", () => {
  it("bills Fleet Maintenance only for active assets above ten", async () => {
    const supabase = supabaseFixture({
      packageKey: "fleet_maintenance",
      activeServiceTrucks: 0,
      fleetAssetCounts: [8, 5],
    });
    const current = subscription("fleet_maintenance", [
      item({
        id: "si_base",
        priceId: "price_fleet",
        lookupKey: "profixiq_fleet_maintenance_monthly_v1",
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
      active_fleet_assets: 13,
      additional_fleet_asset_quantity: 3,
      additional_service_truck_quantity: 0,
      estimated_monthly_price: 156.5,
      proration_behavior: "always_invoice",
    });
    expect(update).toHaveBeenCalledWith(
      current.id,
      expect.objectContaining({
        items: [{ price: "price_asset", quantity: 3 }],
        proration_behavior: "always_invoice",
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringContaining("profixiq:package-sync:"),
      }),
    );
  });

  it("charges Complete for truck capacity but never for shop-managed fleet assets", async () => {
    const supabase = supabaseFixture({
      packageKey: "complete_operations",
      activeServiceTrucks: 3,
      fleetAssetCounts: [12],
    });
    const current = subscription("complete_operations", [
      item({
        id: "si_base",
        priceId: "price_complete",
        lookupKey: "profixiq_complete_operations_monthly_v1",
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
      active_service_trucks: 3,
      active_fleet_assets: 12,
      additional_service_truck_quantity: 1,
      additional_fleet_asset_quantity: 0,
      oversized_complete_fleets: 1,
      estimated_monthly_price: 498,
    });
    expect(update).toHaveBeenCalledWith(
      current.id,
      expect.objectContaining({
        items: [{ price: "price_truck", quantity: 1 }],
        metadata: expect.objectContaining({
          oversized_complete_fleet_count: "1",
          additional_fleet_asset_quantity: "0",
        }),
      }),
      expect.any(Object),
    );
  });

  it("repairs duplicate or drifted primary package items without issuing a credit", async () => {
    const supabase = supabaseFixture({
      packageKey: "field_service",
      activeServiceTrucks: 1,
      fleetAssetCounts: [],
    });
    const current = subscription("field_service", [
      item({
        id: "si_primary",
        priceId: "price_old_field",
        lookupKey: "profixiq_field_service_monthly_v1",
      }),
      item({
        id: "si_duplicate",
        priceId: "price_field",
        lookupKey: "profixiq_field_service_monthly_v1",
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
          { id: "si_primary", price: "price_field", quantity: 1 },
          { id: "si_duplicate", deleted: true },
        ],
        proration_behavior: "none",
      }),
      expect.any(Object),
    );
  });
});
