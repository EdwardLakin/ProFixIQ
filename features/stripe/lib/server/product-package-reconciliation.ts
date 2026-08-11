import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import {
  ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
  ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
  PRODUCT_PACKAGE_BILLING_MODEL,
  PRODUCT_PACKAGE_LOOKUP_KEYS,
  PRODUCT_PACKAGE_PRICING,
  normalizeProductPackageKey,
  type ProductPackageKey,
} from "@/features/stripe/lib/stripe/product-packages";
import {
  resolveProductPackagePriceContract,
  type ProductPackagePriceContract,
} from "@/features/stripe/lib/server/product-package-price-contract";

type DB = Database;

type PackageBillingShop = {
  id: string;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  stripe_pricing_model: string;
  subscription_package: string | null;
};

export type ProductPackageReconciliationResult = {
  state:
    | "updated"
    | "already_synced"
    | "dry_run"
    | "shop_not_found"
    | "no_subscription"
    | "subscription_not_billable"
    | "unrecognized_subscription";
  shop_id: string;
  package_key: ProductPackageKey | null;
  subscription_id: string | null;
  active_service_trucks: number;
  active_fleet_assets: number;
  additional_service_truck_quantity: number;
  additional_fleet_asset_quantity: number;
  oversized_complete_fleets: number;
  estimated_monthly_price: number | null;
  update_applied: boolean;
  proration_behavior: "always_invoice" | "none";
  reason?: string;
};

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isPrice(
  item: Stripe.SubscriptionItem,
  priceId: string,
  lookupKey: string,
): boolean {
  return (
    item.price.id === priceId || normalize(item.price.lookup_key) === lookupKey
  );
}

function totalQuantity(items: Stripe.SubscriptionItem[]): number {
  return items.reduce(
    (total, item) => total + Math.max(0, item.quantity ?? 0),
    0,
  );
}

async function countPackageCapacity(
  supabase: SupabaseClient<DB>,
  shopId: string,
): Promise<{
  activeServiceTrucks: number;
  activeFleetAssets: number;
  oversizedCompleteFleets: number;
}> {
  const [{ count: activeServiceTrucks, error: truckError }, fleetsResult] =
    await Promise.all([
      supabase
        .from("service_vehicles")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("active", true),
      supabase
        .from("fleets")
        .select("id")
        .eq("shop_id", shopId)
        .eq("active", true),
    ]);
  if (truckError) throw new Error(truckError.message);
  if (fleetsResult.error) throw new Error(fleetsResult.error.message);

  const fleetIds = (fleetsResult.data ?? []).map((fleet) => fleet.id);
  if (fleetIds.length === 0) {
    return {
      activeServiceTrucks: activeServiceTrucks ?? 0,
      activeFleetAssets: 0,
      oversizedCompleteFleets: 0,
    };
  }

  const { data: fleetVehicles, error: fleetVehicleError } = await supabase
    .from("fleet_vehicles")
    .select("fleet_id")
    .in("fleet_id", fleetIds)
    .eq("active", true);
  if (fleetVehicleError) throw new Error(fleetVehicleError.message);

  const fleetCounts = new Map<string, number>();
  for (const row of fleetVehicles ?? []) {
    fleetCounts.set(row.fleet_id, (fleetCounts.get(row.fleet_id) ?? 0) + 1);
  }

  return {
    activeServiceTrucks: activeServiceTrucks ?? 0,
    activeFleetAssets: fleetVehicles?.length ?? 0,
    oversizedCompleteFleets: [...fleetCounts.values()].filter(
      (count) => count > 10,
    ).length,
  };
}

async function persistFailure(
  supabase: SupabaseClient<DB>,
  shopId: string,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown product package sync error";
  await supabase
    .from("shops")
    .update({
      stripe_billing_sync_required: true,
      stripe_billing_sync_error: message.slice(0, 1000),
    })
    .eq("id", shopId);
}

export async function reconcileProductPackageSubscription(params: {
  stripe: Stripe;
  supabase: SupabaseClient<DB>;
  shopId: string;
  applyUpdate?: boolean;
  priceContract?: ProductPackagePriceContract;
}): Promise<ProductPackageReconciliationResult> {
  const {
    stripe,
    supabase,
    shopId,
    applyUpdate = true,
    priceContract,
  } = params;

  try {
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select(
        "id, stripe_subscription_id, stripe_subscription_status, stripe_pricing_model, subscription_package",
      )
      .eq("id", shopId)
      .maybeSingle<PackageBillingShop>();
    if (shopError) throw new Error(shopError.message);

    const emptyResult = {
      shop_id: shopId,
      package_key: null,
      subscription_id: null,
      active_service_trucks: 0,
      active_fleet_assets: 0,
      additional_service_truck_quantity: 0,
      additional_fleet_asset_quantity: 0,
      oversized_complete_fleets: 0,
      estimated_monthly_price: null,
      update_applied: false,
      proration_behavior: "none" as const,
    };
    if (!shop) return { ...emptyResult, state: "shop_not_found" };

    const packageKey = normalizeProductPackageKey(shop.subscription_package);
    if (
      shop.stripe_pricing_model !== PRODUCT_PACKAGE_BILLING_MODEL ||
      !packageKey
    ) {
      return {
        ...emptyResult,
        state: "unrecognized_subscription",
        reason: "shop_is_not_on_product_package_billing",
      };
    }

    const capacity = await countPackageCapacity(supabase, shopId);
    const includedTrucks =
      PRODUCT_PACKAGE_PRICING[packageKey].includedServiceTrucks;
    const includedAssets =
      PRODUCT_PACKAGE_PRICING[packageKey].includedFleetAssets;
    const additionalTruckQuantity =
      packageKey === "field_service" || packageKey === "complete_operations"
        ? Math.max(0, capacity.activeServiceTrucks - includedTrucks)
        : 0;
    // Complete never transfers a participating fleet's asset charge to the
    // servicing shop. A fleet above ten is gated until it owns Fleet Maintenance.
    const additionalFleetAssetQuantity =
      packageKey === "fleet_maintenance"
        ? Math.max(0, capacity.activeFleetAssets - includedAssets)
        : 0;
    const estimatedMonthlyCents =
      PRODUCT_PACKAGE_PRICING[packageKey].monthlyCents +
      additionalTruckQuantity *
        PRODUCT_PACKAGE_PRICING.additionalServiceTruckCents +
      additionalFleetAssetQuantity *
        PRODUCT_PACKAGE_PRICING.additionalFleetAssetCents;
    const subscriptionId = String(shop.stripe_subscription_id ?? "").trim();
    const commonResult = {
      ...emptyResult,
      package_key: packageKey,
      subscription_id: subscriptionId || null,
      active_service_trucks: capacity.activeServiceTrucks,
      active_fleet_assets: capacity.activeFleetAssets,
      additional_service_truck_quantity: additionalTruckQuantity,
      additional_fleet_asset_quantity: additionalFleetAssetQuantity,
      oversized_complete_fleets:
        packageKey === "complete_operations"
          ? capacity.oversizedCompleteFleets
          : 0,
      estimated_monthly_price: estimatedMonthlyCents / 100,
    };
    if (!subscriptionId) {
      return { ...commonResult, state: "no_subscription" };
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (!new Set(["active", "trialing", "past_due"]).has(subscription.status)) {
      return {
        ...commonResult,
        state: "subscription_not_billable",
        reason: `subscription_status_${subscription.status}`,
      };
    }

    const contract =
      priceContract ?? (await resolveProductPackagePriceContract(stripe));
    const primaryItems = subscription.items.data.filter((item) =>
      isPrice(
        item,
        contract.packagePriceIds[packageKey],
        PRODUCT_PACKAGE_LOOKUP_KEYS[packageKey],
      ),
    );
    const truckItems = subscription.items.data.filter((item) =>
      isPrice(
        item,
        contract.additionalServiceTruckPriceId,
        ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
      ),
    );
    const assetItems = subscription.items.data.filter((item) =>
      isPrice(
        item,
        contract.additionalFleetAssetPriceId,
        ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
      ),
    );
    const primaryItem = primaryItems[0] ?? null;
    if (!primaryItem) {
      return {
        ...commonResult,
        state: "unrecognized_subscription",
        reason: "subscription_has_no_matching_package_price",
      };
    }

    const quantityMatches = (
      items: Stripe.SubscriptionItem[],
      quantity: number,
      priceId: string,
    ) =>
      quantity === 0
        ? items.length === 0
        : items.length === 1 &&
          items[0]?.price.id === priceId &&
          (items[0].quantity ?? 0) === quantity;
    const primaryMatches =
      primaryItems.length === 1 &&
      primaryItem.price.id === contract.packagePriceIds[packageKey] &&
      (primaryItem.quantity ?? 1) === 1;
    const alreadySynced =
      primaryMatches &&
      quantityMatches(
        truckItems,
        additionalTruckQuantity,
        contract.additionalServiceTruckPriceId,
      ) &&
      quantityMatches(
        assetItems,
        additionalFleetAssetQuantity,
        contract.additionalFleetAssetPriceId,
      );
    const prorationBehavior: "always_invoice" | "none" =
      additionalTruckQuantity > totalQuantity(truckItems) ||
      additionalFleetAssetQuantity > totalQuantity(assetItems)
        ? "always_invoice"
        : "none";

    if (alreadySynced || !applyUpdate) {
      if (alreadySynced && applyUpdate) {
        const { error } = await supabase
          .from("shops")
          .update({
            stripe_billing_sync_required: false,
            stripe_billing_sync_error: null,
            stripe_billing_synced_at: new Date().toISOString(),
          })
          .eq("id", shopId);
        if (error) throw new Error(error.message);
      }
      return {
        ...commonResult,
        state: alreadySynced ? "already_synced" : "dry_run",
        proration_behavior: prorationBehavior,
        reason: alreadySynced
          ? "subscription_items_match_package_capacity"
          : "subscription_update_required",
      };
    }

    const items: Stripe.SubscriptionUpdateParams.Item[] = [];
    if (!primaryMatches) {
      items.push({
        id: primaryItem.id,
        price: contract.packagePriceIds[packageKey],
        quantity: 1,
      });
      for (const duplicate of primaryItems.slice(1)) {
        items.push({ id: duplicate.id, deleted: true });
      }
    }
    const reconcileQuantity = (
      existing: Stripe.SubscriptionItem[],
      priceId: string,
      quantity: number,
    ) => {
      const first = existing[0];
      if (quantity === 0) {
        for (const item of existing) items.push({ id: item.id, deleted: true });
      } else if (first) {
        items.push({ id: first.id, price: priceId, quantity });
        for (const duplicate of existing.slice(1)) {
          items.push({ id: duplicate.id, deleted: true });
        }
      } else {
        items.push({ price: priceId, quantity });
      }
    };
    reconcileQuantity(
      truckItems,
      contract.additionalServiceTruckPriceId,
      additionalTruckQuantity,
    );
    reconcileQuantity(
      assetItems,
      contract.additionalFleetAssetPriceId,
      additionalFleetAssetQuantity,
    );

    const updated = await stripe.subscriptions.update(
      subscription.id,
      {
        items,
        proration_behavior: prorationBehavior,
        metadata: {
          ...(subscription.metadata ?? {}),
          app: "profixiq",
          shop_id: shopId,
          pricing_model: PRODUCT_PACKAGE_BILLING_MODEL,
          package_key: packageKey,
          active_service_truck_count: String(capacity.activeServiceTrucks),
          additional_service_truck_quantity: String(additionalTruckQuantity),
          active_fleet_asset_count: String(capacity.activeFleetAssets),
          additional_fleet_asset_quantity: String(additionalFleetAssetQuantity),
          oversized_complete_fleet_count: String(
            packageKey === "complete_operations"
              ? capacity.oversizedCompleteFleets
              : 0,
          ),
        },
      },
      {
        idempotencyKey: `profixiq:package-sync:${shopId}:${subscription.current_period_start}:${packageKey}:${capacity.activeServiceTrucks}:${capacity.activeFleetAssets}`,
      },
    );

    const { error: updateError } = await supabase
      .from("shops")
      .update({
        stripe_subscription_id: updated.id,
        stripe_billing_sync_required: false,
        stripe_billing_sync_error: null,
        stripe_billing_synced_at: new Date().toISOString(),
      })
      .eq("id", shopId);
    if (updateError) throw new Error(updateError.message);

    return {
      ...commonResult,
      state: "updated",
      update_applied: true,
      proration_behavior: prorationBehavior,
      reason: "subscription_items_reconciled_to_package_capacity",
    };
  } catch (error) {
    await persistFailure(supabase, shopId, error);
    throw error;
  }
}
