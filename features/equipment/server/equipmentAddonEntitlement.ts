import "server-only";

import type Stripe from "stripe";

import { resolveProductPackageFromSubscription } from "@/features/stripe/lib/server/canonical-shop-billing";
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
  packageKey: string | null;
  subscriptionStatus: string | null;
};

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
 * Equipment is deliberately not part of Complete Operations itself. Access is
 * granted only when the same canonical subscription contains both a real
 * Complete base-price item and an active Equipment add-on item. Subscription
 * metadata alone cannot grant this premium add-on.
 */
export function resolveEquipmentAddonEntitlement(
  subscription: Stripe.Subscription,
): EquipmentAddonEntitlement {
  const packageKey = resolveProductPackageFromSubscription(subscription);
  const subscriptionStatus = String(subscription.status ?? "").trim() || null;
  const hasCompleteBaseItem = subscriptionHasCompleteBaseItem(subscription);
  const hasAddonItem = subscriptionHasEquipmentAddon(subscription);

  return {
    enabled:
      hasCompleteBaseItem &&
      isProductSubscriptionEntitled(subscriptionStatus) &&
      hasAddonItem,
    hasAddonItem,
    hasCompleteBaseItem,
    packageKey,
    subscriptionStatus,
  };
}
