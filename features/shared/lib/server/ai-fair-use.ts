import "server-only";

import type { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { isDefaultWorkforceRole } from "@/features/workforce/lib/roster";
import {
  BASE_MONTHLY_PRICE,
  calculateMonthlySubscriptionPrice,
} from "@/features/stripe/lib/stripe/billing-model";
import {
  PRODUCT_PACKAGE_BILLING_MODEL,
  PRODUCT_PACKAGE_INCLUDED_USERS,
  PRODUCT_PACKAGE_PRICING,
  isProductSubscriptionEntitled,
  normalizeProductPackageKey,
  type ProductPackageKey,
} from "@/features/stripe/lib/stripe/product-packages";

export const DEFAULT_AI_FAIR_USE_COGS_RATIO = 0.2;
export const MAX_AI_FAIR_USE_COGS_RATIO = 0.25;

type AdminClient = ReturnType<typeof createAdminSupabase>;

type ShopAIBudgetRow = {
  stripe_pricing_model: string | null;
  subscription_package: string | null;
  stripe_subscription_status: string | null;
  billing_catalog_currency: string | null;
};

// Neither stripe_pricing_model nor subscription_package says whether a
// product-package shop is on the new USD catalog or the grandfathered CAD
// one (see product-package-price-contract.ts). A CAD-grandfathered shop is
// never charged for additional staff seats and its Complete base is $449,
// not $499 USD — pricing its AI ceiling off the USD list price would
// overstate its real revenue. These mirror the historical CAD base amounts
// product-package-price-contract.ts's LEGACY_CAD_PACKAGE_PRICES validates
// against; keep both in sync.
const LEGACY_CAD_PACKAGE_BASE_CENTS: Record<ProductPackageKey, number> = {
  shop_operations: 29_900,
  field_service: 19_900,
  fleet_maintenance: 14_900,
  complete_operations: 44_900,
};

function normalizedUserCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}

function configuredRatio(): number {
  const raw = Number(process.env.AI_FAIR_USE_COGS_RATIO);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_AI_FAIR_USE_COGS_RATIO;
  // This is an economic safety rail, not merely a tunable feature flag. Even a
  // bad environment value cannot allow AI alone to consume more than 25% of
  // recurring subscription revenue.
  return Math.min(MAX_AI_FAIR_USE_COGS_RATIO, raw);
}

export function calculateShopMonthlyRecurringRevenueUsd(input: {
  stripePricingModel: string | null;
  subscriptionPackage: string | null;
  billableUserCount: number | null;
  billingCatalogCurrency?: string | null;
}): number {
  const users = normalizedUserCount(input.billableUserCount);
  const packageKey = normalizeProductPackageKey(input.subscriptionPackage);
  const isLegacyCad = input.billingCatalogCurrency === "cad";

  if (input.stripePricingModel === PRODUCT_PACKAGE_BILLING_MODEL && packageKey) {
    // A CAD-grandfathered subscription is never charged for additional staff
    // seats (see reconcileProductPackageSubscription's legacyCad branch), so
    // its revenue estimate must not add seat charges it does not actually
    // collect, and its base differs for Complete ($449 CAD vs $499 USD).
    if (isLegacyCad) {
      return LEGACY_CAD_PACKAGE_BASE_CENTS[packageKey] / 100;
    }

    const baseCents = PRODUCT_PACKAGE_PRICING[packageKey].monthlyCents;
    const additionalUserCents =
      packageKey === "shop_operations" || packageKey === "complete_operations"
        ? Math.max(0, users - PRODUCT_PACKAGE_INCLUDED_USERS) *
          PRODUCT_PACKAGE_PRICING.additionalUserCents
        : 0;

    // Service-truck and fleet-asset add-ons are deliberately excluded here.
    // Under-counting revenue makes the AI ceiling more conservative, while
    // staff-seat revenue is included because it scales with the users most
    // likely to consume technician AI.
    return (baseCents + additionalUserCents) / 100;
  }

  if (input.stripePricingModel === "base_plus_seats_v2") {
    return calculateMonthlySubscriptionPrice(users);
  }

  // Legacy / incomplete billing identity gets the smallest normal Shop base,
  // rather than an unbounded or zero guard. AI can remain available while a
  // billing repair is pending, but its spend stays conservatively capped.
  return BASE_MONTHLY_PRICE;
}

export function calculateAIFairUseBudgetUsd(input: {
  monthlyRecurringRevenueUsd: number;
  ratio?: number;
}): number {
  const revenue = Number.isFinite(input.monthlyRecurringRevenueUsd)
    ? Math.max(0, input.monthlyRecurringRevenueUsd)
    : 0;
  const ratio = Number.isFinite(input.ratio)
    ? Math.min(
        MAX_AI_FAIR_USE_COGS_RATIO,
        Math.max(0, Number(input.ratio)),
      )
    : configuredRatio();
  return Math.floor(revenue * ratio * 100) / 100;
}

async function countBillableStaff(
  admin: AdminClient,
  shopId: string,
): Promise<number> {
  // Computed fresh here rather than read from shops.billable_user_count:
  // that denormalized column is also written by triggers and the legacy
  // (non-package) seat-reconciliation path, both of which still count every
  // profiles row with no workforce-role filter — a Fleet-portal invitee or a
  // shop-provisioned dispatcher/driver would otherwise inflate the AI
  // ceiling itself. Keeping this feature's revenue estimate self-contained
  // means it stays correct regardless of whether those other paths have
  // been fixed or have run recently.
  const { data, error } = await admin
    .from("profiles")
    .select("role")
    .eq("shop_id", shopId);
  if (error) {
    throw new Error(`AI fair-use staff count failed: ${error.message}`);
  }
  return (data ?? []).filter((row) => isDefaultWorkforceRole(row.role)).length;
}

export async function resolveShopAIFairUseBudgetUsd(
  admin: AdminClient,
  shopId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("shops")
    .select(
      "stripe_pricing_model, subscription_package, stripe_subscription_status, billing_catalog_currency",
    )
    .eq("id", shopId)
    .maybeSingle<ShopAIBudgetRow>();

  if (error) {
    throw new Error(`AI fair-use billing lookup failed: ${error.message}`);
  }
  if (!data) throw new Error("AI fair-use billing lookup failed: shop not found");

  // A canceled, incomplete, or otherwise non-entitled subscription generates
  // no recurring revenue at all. Falling through to a fallback dollar figure
  // here would let AI keep spending against revenue that no longer exists —
  // exactly the surprise loss this guard exists to prevent. This overrides
  // the pricing-model branch below rather than feeding into it.
  if (!isProductSubscriptionEntitled(data.stripe_subscription_status)) {
    return 0;
  }

  const billableUserCount = await countBillableStaff(admin, shopId);
  const monthlyRecurringRevenueUsd = calculateShopMonthlyRecurringRevenueUsd({
    stripePricingModel: data.stripe_pricing_model,
    subscriptionPackage: data.subscription_package,
    billableUserCount,
    billingCatalogCurrency: data.billing_catalog_currency,
  });
  return calculateAIFairUseBudgetUsd({ monthlyRecurringRevenueUsd });
}
