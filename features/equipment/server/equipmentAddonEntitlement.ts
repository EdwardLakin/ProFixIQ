import "server-only";

import type Stripe from "stripe";

import { resolveProductPackageFromSubscription } from "@/features/stripe/lib/server/canonical-shop-billing";
import {
  EQUIPMENT_ADDON_LOOKUP_KEY,
  EQUIPMENT_ADDON_PRODUCT_KEY,
  isProductSubscriptionEntitled,
} from "@/features/stripe/lib/stripe/product-packages";

export type EquipmentAddonEntitlement = {
  enabled: boolean;
  hasAddonItem: boolean;
  packageKey: string | null;
  subscriptionStatus: string | null;
};

export function subscriptionHasEquipmentAddon(
  subscription: Stripe.Subscription,
): boolean {
  return subscription.items.data.some((item) => {
    const quantity = Number(item.quantity ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) return false;

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
 * granted only when the same canonical subscription has both the Complete base
 * package and an active Equipment add-on item.
 */
export function resolveEquipmentAddonEntitlement(
  subscription: Stripe.Subscription,
): EquipmentAddonEntitlement {
  const packageKey = resolveProductPackageFromSubscription(subscription);
  const subscriptionStatus = String(subscription.status ?? "").trim() || null;
  const hasAddonItem = subscriptionHasEquipmentAddon(subscription);

  return {
    enabled:
      packageKey === "complete_operations" &&
      isProductSubscriptionEntitled(subscriptionStatus) &&
      hasAddonItem,
    hasAddonItem,
    packageKey,
    subscriptionStatus,
  };
}
