import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { isDefaultWorkforceRole } from "@/features/workforce/lib/roster";
import {
  ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
  ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
  ADDITIONAL_USER_LOOKUP_KEY,
  LEGACY_ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
  LEGACY_ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
  LEGACY_PRODUCT_PACKAGE_LOOKUP_KEYS,
  PRODUCT_PACKAGE_BILLING_MODEL,
  PRODUCT_PACKAGE_INCLUDED_USERS,
  PRODUCT_PACKAGE_LOOKUP_KEYS,
  PRODUCT_PACKAGE_PRICING,
  normalizeProductPackageKey,
  type ProductPackageKey,
} from "@/features/stripe/lib/stripe/product-packages";
import {
  resolveProductPackagePriceContract,
  type ProductPackageCatalogPriceIds,
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
  active_users: number;
  included_users: number;
  additional_user_quantity: number;
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

function isAnyPrice(
  item: Stripe.SubscriptionItem,
  candidates: Array<{ priceId: string; lookupKey: string }>,
): boolean {
  return candidates.some((candidate) =>
    isPrice(item, candidate.priceId, candidate.lookupKey),
  );
}

function totalQuantity(items: Stripe.SubscriptionItem[]): number {
  return items.reduce(
    (total, item) => total + Math.max(0, item.quantity ?? 0),
    0,
  );
}

function countStaffProfiles(rows: Array<{ role: string | null }>): number {
  return rows.filter((row) => isDefaultWorkforceRole(row.role)).length;
}

// The target seat/truck/asset quantities for a shop can legitimately revisit
// a value already reconciled earlier in the same billing period (11 -> 10 ->
// 11 active staff). Embedding those raw quantities directly in the Stripe
// idempotency key would then reproduce an earlier call's key, and Stripe
// would replay that earlier cached response instead of executing the new
// update, silently leaving the live subscription out of sync. A durable
// per-shop generation that only advances when the target signature actually
// changes gives each distinct transition its own key, while still reusing
// the same key (and therefore safe replay) for retries of one transition
// that has not finished yet.
async function advanceBillingReconciliationGeneration(
  supabase: SupabaseClient<DB>,
  shopId: string,
  signature: string,
): Promise<number> {
  const { data, error } = await supabase.rpc(
    "advance_billing_reconciliation_generation",
    { p_shop_id: shopId, p_signature: signature },
  );
  if (error) throw new Error(error.message);
  if (typeof data !== "number") {
    throw new Error(
      `advance_billing_reconciliation_generation returned no generation for shop ${shopId}`,
    );
  }
  return data;
}

async function countPackageCapacity(
  supabase: SupabaseClient<DB>,
  shopId: string,
): Promise<{
  activeUsers: number;
  activeServiceTrucks: number;
  activeFleetAssets: number;
  oversizedCompleteFleets: number;
}> {
  const [
    { data: shopProfiles, error: usersError },
    { count: activeServiceTrucks, error: truckError },
    fleetsResult,
  ] = await Promise.all([
    supabase.from("profiles").select("role").eq("shop_id", shopId),
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
  if (usersError) throw new Error(usersError.message);
  if (truckError) throw new Error(truckError.message);
  if (fleetsResult.error) throw new Error(fleetsResult.error.message);

  // Fleet-portal identities (external fleet clients invited into the Fleet
  // portal) get a `profiles` row scoped to this shop so RLS resolves, but
  // they are not paid staff seats. Customers never get a `profiles` row at
  // all, so no separate exclusion is needed for them.
  const activeUsers = countStaffProfiles(shopProfiles ?? []);

  const fleetIds = (fleetsResult.data ?? []).map((fleet) => fleet.id);
  if (fleetIds.length === 0) {
    return {
      activeUsers,
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
    activeUsers,
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

function catalogForSubscription(input: {
  subscription: Stripe.Subscription;
  packageKey: ProductPackageKey;
  contract: ProductPackagePriceContract;
}): {
  catalog: ProductPackageCatalogPriceIds;
  lookupKeys: Record<ProductPackageKey, string>;
  truckLookupKey: string;
  assetLookupKey: string;
  legacyCad: boolean;
} | null {
  const { subscription, packageKey, contract } = input;
  const currentPrimary = subscription.items.data.some((item) =>
    isPrice(
      item,
      contract.packagePriceIds[packageKey],
      PRODUCT_PACKAGE_LOOKUP_KEYS[packageKey],
    ),
  );
  if (currentPrimary) {
    return {
      catalog: contract,
      lookupKeys: PRODUCT_PACKAGE_LOOKUP_KEYS,
      truckLookupKey: ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
      assetLookupKey: ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
      legacyCad: false,
    };
  }

  const legacyPrimary = subscription.items.data.some((item) =>
    isPrice(
      item,
      contract.legacyCad.packagePriceIds[packageKey],
      LEGACY_PRODUCT_PACKAGE_LOOKUP_KEYS[packageKey],
    ),
  );
  if (!legacyPrimary) return null;

  return {
    catalog: contract.legacyCad,
    lookupKeys: LEGACY_PRODUCT_PACKAGE_LOOKUP_KEYS,
    truckLookupKey: LEGACY_ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
    assetLookupKey: LEGACY_ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
    legacyCad: true,
  };
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
      active_users: 0,
      included_users: PRODUCT_PACKAGE_INCLUDED_USERS,
      additional_user_quantity: 0,
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
    const currentCatalogAdditionalUsers =
      packageKey === "shop_operations" || packageKey === "complete_operations"
        ? Math.max(0, capacity.activeUsers - PRODUCT_PACKAGE_INCLUDED_USERS)
        : 0;
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
      currentCatalogAdditionalUsers * PRODUCT_PACKAGE_PRICING.additionalUserCents +
      additionalTruckQuantity *
        PRODUCT_PACKAGE_PRICING.additionalServiceTruckCents +
      additionalFleetAssetQuantity *
        PRODUCT_PACKAGE_PRICING.additionalFleetAssetCents;
    const subscriptionId = String(shop.stripe_subscription_id ?? "").trim();
    const commonResult = {
      ...emptyResult,
      package_key: packageKey,
      subscription_id: subscriptionId || null,
      active_users: capacity.activeUsers,
      additional_user_quantity: currentCatalogAdditionalUsers,
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
    const selectedCatalog = catalogForSubscription({
      subscription,
      packageKey,
      contract,
    });
    if (!selectedCatalog) {
      return {
        ...commonResult,
        state: "unrecognized_subscription",
        reason: "subscription_has_no_matching_package_price",
      };
    }

    const {
      catalog,
      lookupKeys,
      truckLookupKey,
      assetLookupKey,
      legacyCad,
    } = selectedCatalog;
    // Existing CAD package subscriptions are grandfathered in place. They keep
    // their existing capacity billing and are never silently converted to USD.
    const additionalUserQuantity = legacyCad ? 0 : currentCatalogAdditionalUsers;
    const resultWithCatalog = {
      ...commonResult,
      additional_user_quantity: additionalUserQuantity,
      reason: legacyCad ? "legacy_cad_catalog_preserved" : undefined,
    };

    const primaryItems = subscription.items.data.filter((item) =>
      isPrice(item, catalog.packagePriceIds[packageKey], lookupKeys[packageKey]),
    );
    const truckItems = subscription.items.data.filter((item) =>
      isPrice(
        item,
        catalog.additionalServiceTruckPriceId,
        truckLookupKey,
      ),
    );
    const assetItems = subscription.items.data.filter((item) =>
      isPrice(
        item,
        catalog.additionalFleetAssetPriceId,
        assetLookupKey,
      ),
    );
    const userItems = legacyCad
      ? []
      : subscription.items.data.filter((item) =>
          isAnyPrice(item, [
            {
              priceId: contract.additionalUserPriceId,
              lookupKey: ADDITIONAL_USER_LOOKUP_KEY,
            },
          ]),
        );
    const primaryItem = primaryItems[0] ?? null;
    if (!primaryItem) {
      return {
        ...resultWithCatalog,
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
      primaryItem.price.id === catalog.packagePriceIds[packageKey] &&
      (primaryItem.quantity ?? 1) === 1;
    const userMatches = legacyCad
      ? true
      : quantityMatches(
          userItems,
          additionalUserQuantity,
          contract.additionalUserPriceId,
        );
    const alreadySynced =
      primaryMatches &&
      userMatches &&
      quantityMatches(
        truckItems,
        additionalTruckQuantity,
        catalog.additionalServiceTruckPriceId,
      ) &&
      quantityMatches(
        assetItems,
        additionalFleetAssetQuantity,
        catalog.additionalFleetAssetPriceId,
      );
    const prorationBehavior: "always_invoice" | "none" =
      additionalUserQuantity > totalQuantity(userItems) ||
      additionalTruckQuantity > totalQuantity(truckItems) ||
      additionalFleetAssetQuantity > totalQuantity(assetItems)
        ? "always_invoice"
        : "none";

    if (alreadySynced || !applyUpdate) {
      if (alreadySynced && applyUpdate) {
        const { error } = await supabase
          .from("shops")
          .update({
            billable_user_count: capacity.activeUsers,
            active_user_count: capacity.activeUsers,
            stripe_billing_sync_required: false,
            stripe_billing_sync_error: null,
            stripe_billing_synced_at: new Date().toISOString(),
          })
          .eq("id", shopId);
        if (error) throw new Error(error.message);
      }
      return {
        ...resultWithCatalog,
        state: alreadySynced ? "already_synced" : "dry_run",
        proration_behavior: prorationBehavior,
        reason: alreadySynced
          ? legacyCad
            ? "legacy_cad_subscription_capacity_synced_without_currency_conversion"
            : "subscription_items_match_package_capacity"
          : "subscription_update_required",
      };
    }

    const items: Stripe.SubscriptionUpdateParams.Item[] = [];
    if (!primaryMatches) {
      items.push({
        id: primaryItem.id,
        price: catalog.packagePriceIds[packageKey],
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
    if (!legacyCad) {
      reconcileQuantity(
        userItems,
        contract.additionalUserPriceId,
        additionalUserQuantity,
      );
    }
    reconcileQuantity(
      truckItems,
      catalog.additionalServiceTruckPriceId,
      additionalTruckQuantity,
    );
    reconcileQuantity(
      assetItems,
      catalog.additionalFleetAssetPriceId,
      additionalFleetAssetQuantity,
    );

    const billingSignature = `${packageKey}:${legacyCad ? "cad" : "usd"}:${additionalUserQuantity}:${additionalTruckQuantity}:${additionalFleetAssetQuantity}`;
    const billingGeneration = await advanceBillingReconciliationGeneration(
      supabase,
      shopId,
      billingSignature,
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
          billing_currency: legacyCad ? "cad" : "usd",
          billable_user_count: String(capacity.activeUsers),
          included_user_count: String(PRODUCT_PACKAGE_INCLUDED_USERS),
          additional_user_quantity: String(additionalUserQuantity),
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
        idempotencyKey: `profixiq:package-sync:${shopId}:${subscription.current_period_start}:${packageKey}:${legacyCad ? "cad-v1" : "usd-v2"}:gen-${billingGeneration}`,
      },
    );

    const { error: updateError } = await supabase
      .from("shops")
      .update({
        stripe_subscription_id: updated.id,
        billable_user_count: capacity.activeUsers,
        active_user_count: capacity.activeUsers,
        stripe_billing_sync_required: false,
        stripe_billing_sync_error: null,
        stripe_billing_synced_at: new Date().toISOString(),
      })
      .eq("id", shopId);
    if (updateError) throw new Error(updateError.message);

    return {
      ...resultWithCatalog,
      state: "updated",
      update_applied: true,
      proration_behavior: prorationBehavior,
      reason: legacyCad
        ? "legacy_cad_subscription_capacity_reconciled_without_currency_conversion"
        : "subscription_items_reconciled_to_package_capacity",
    };
  } catch (error) {
    await persistFailure(supabase, shopId, error);
    throw error;
  }
}
