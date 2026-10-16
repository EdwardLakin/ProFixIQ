import "server-only";

import type Stripe from "stripe";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { resolveProductPackageFromSubscription } from "@/features/stripe/lib/server/canonical-shop-billing";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import {
  EQUIPMENT_ADDON_LOOKUP_KEY,
  EQUIPMENT_ADDON_PRODUCT_KEY,
  isProductSubscriptionEntitled,
  LEGACY_PRODUCT_PACKAGE_LOOKUP_KEYS,
  PRODUCT_PACKAGE_LOOKUP_KEYS,
} from "@/features/stripe/lib/stripe/product-packages";

export type EquipmentAddonEntitlement = {
  enabled: boolean;
  hasAddonItem: boolean;
  hasCompleteBaseItem: boolean;
  hasStandaloneEquipmentItem: boolean;
  packageKey: string | null;
  subscriptionStatus: string | null;
};

type EquipmentBillingLink = {
  id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_entitlement_override: string | null;
};

const INTERNAL_DEMO_ENTITLEMENT = "internal_demo";

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing required env: ${name}`);
  return value;
}

function disabledEntitlement(): EquipmentAddonEntitlement {
  return {
    enabled: false,
    hasAddonItem: false,
    hasCompleteBaseItem: false,
    hasStandaloneEquipmentItem: false,
    packageKey: null,
    subscriptionStatus: null,
  };
}

function internalDemoEntitlement(): EquipmentAddonEntitlement {
  return {
    enabled: true,
    hasAddonItem: true,
    hasCompleteBaseItem: true,
    hasStandaloneEquipmentItem: false,
    packageKey: "complete_operations",
    subscriptionStatus: INTERNAL_DEMO_ENTITLEMENT,
  };
}

function positiveQuantity(item: Stripe.SubscriptionItem): boolean {
  const quantity = Number(item.quantity ?? 0);
  return Number.isFinite(quantity) && quantity > 0;
}

export function subscriptionHasCompleteBaseItem(
  subscription: Stripe.Subscription,
): boolean {
  return subscription.items.data.some((item) => {
    if (!positiveQuantity(item)) return false;

    const packageKey = String(item.price?.metadata?.package_key ?? "")
      .trim()
      .toLowerCase();
    const lookupKey = String(item.price?.lookup_key ?? "").trim();

    return (
      packageKey === "complete_operations" ||
      lookupKey === PRODUCT_PACKAGE_LOOKUP_KEYS.complete_operations ||
      lookupKey === LEGACY_PRODUCT_PACKAGE_LOOKUP_KEYS.complete_operations
    );
  });
}

export function subscriptionHasStandaloneEquipmentItem(
  subscription: Stripe.Subscription,
): boolean {
  return subscription.items.data.some((item) => {
    if (!positiveQuantity(item)) return false;

    const packageKey = String(item.price?.metadata?.package_key ?? "")
      .trim()
      .toLowerCase();
    const lookupKey = String(item.price?.lookup_key ?? "").trim();

    return (
      packageKey === "equipment_operations" ||
      lookupKey === PRODUCT_PACKAGE_LOOKUP_KEYS.equipment_operations
    );
  });
}

export function subscriptionHasEquipmentAddon(
  subscription: Stripe.Subscription,
): boolean {
  return subscription.items.data.some((item) => {
    if (!positiveQuantity(item)) return false;

    const lookupKey = String(item.price?.lookup_key ?? "").trim();
    const productKey = String(item.price?.metadata?.product_key ?? "")
      .trim()
      .toLowerCase();

    return (
      lookupKey === EQUIPMENT_ADDON_LOOKUP_KEY ||
      productKey === EQUIPMENT_ADDON_PRODUCT_KEY
    );
  });
}

/**
 * Equipment is deliberately not part of Complete Operations itself. Paying
 * shops receive access either through the standalone Equipment Operations base
 * item, or (legacy bridge, unchanged) when the same canonical subscription
 * contains both a real Complete base-price item and an active Equipment add-on
 * item.
 * The server-owned `internal_demo` billing override is the sole non-Stripe
 * exception so the canonical ProFixIQ demo can permanently exercise Equipment
 * without creating a billable subscription item.
 */
export function resolveEquipmentAddonEntitlement(
  subscription: Stripe.Subscription,
): EquipmentAddonEntitlement {
  const packageKey = resolveProductPackageFromSubscription(subscription);
  const subscriptionStatus = String(subscription.status ?? "").trim() || null;
  const hasCompleteBaseItem = subscriptionHasCompleteBaseItem(subscription);
  const hasAddonItem = subscriptionHasEquipmentAddon(subscription);
  const hasStandaloneEquipmentItem =
    subscriptionHasStandaloneEquipmentItem(subscription);

  return {
    enabled:
      isProductSubscriptionEntitled(subscriptionStatus) &&
      ((hasCompleteBaseItem && hasAddonItem) || hasStandaloneEquipmentItem),
    hasAddonItem,
    hasCompleteBaseItem,
    hasStandaloneEquipmentItem,
    packageKey,
    subscriptionStatus,
  };
}

/**
 * Resolve Equipment access from the authenticated shop boundary without
 * depending on whether the caller can read financial columns on `shops` via
 * RLS. Callers must authenticate/authorize first and pass only that canonical
 * shop id; service-role access here is then constrained to that exact row.
 */
export async function resolveEquipmentAddonEntitlementForShop(
  shopId: string,
): Promise<EquipmentAddonEntitlement> {
  const admin = createAdminSupabase();
  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("id,stripe_customer_id,stripe_subscription_id,billing_entitlement_override")
    .eq("id", shopId)
    .maybeSingle<EquipmentBillingLink>();

  if (shopError) throw new Error(shopError.message);
  if (!shop || shop.id !== shopId) {
    throw new Error("Equipment billing shop could not be resolved.");
  }

  if (shop.billing_entitlement_override === INTERNAL_DEMO_ENTITLEMENT) {
    return internalDemoEntitlement();
  }

  const subscriptionId = String(shop.stripe_subscription_id ?? "").trim();
  if (!subscriptionId) return disabledEntitlement();

  const stripe = createStripeClient(mustEnv("STRIPE_SECRET_KEY"));
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const subscriptionCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;
  const canonicalCustomerId = String(shop.stripe_customer_id ?? "").trim();
  const metadataShopId = String(subscription.metadata?.shop_id ?? "").trim();

  if (
    (canonicalCustomerId && subscriptionCustomerId !== canonicalCustomerId) ||
    (metadataShopId && metadataShopId !== shopId)
  ) {
    throw new Error("Canonical Stripe linkage mismatch for Equipment entitlement.");
  }

  return resolveEquipmentAddonEntitlement(subscription);
}
