import "server-only";

import type { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  BASE_MONTHLY_PRICE,
  calculateMonthlySubscriptionPrice,
} from "@/features/stripe/lib/stripe/billing-model";
import {
  PRODUCT_PACKAGE_BILLING_MODEL,
  PRODUCT_PACKAGE_INCLUDED_USERS,
  PRODUCT_PACKAGE_PRICING,
  normalizeProductPackageKey,
} from "@/features/stripe/lib/stripe/product-packages";

export const DEFAULT_AI_FAIR_USE_COGS_RATIO = 0.2;
export const MAX_AI_FAIR_USE_COGS_RATIO = 0.25;

type AdminClient = ReturnType<typeof createAdminSupabase>;

type ShopAIBudgetRow = {
  stripe_pricing_model: string | null;
  subscription_package: string | null;
  billable_user_count: number | null;
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
}): number {
  const users = normalizedUserCount(input.billableUserCount);
  const packageKey = normalizeProductPackageKey(input.subscriptionPackage);

  if (input.stripePricingModel === PRODUCT_PACKAGE_BILLING_MODEL && packageKey) {
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

export async function resolveShopAIFairUseBudgetUsd(
  admin: AdminClient,
  shopId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("shops")
    .select("stripe_pricing_model, subscription_package, billable_user_count")
    .eq("id", shopId)
    .maybeSingle<ShopAIBudgetRow>();

  if (error) {
    throw new Error(`AI fair-use billing lookup failed: ${error.message}`);
  }
  if (!data) throw new Error("AI fair-use billing lookup failed: shop not found");

  const monthlyRecurringRevenueUsd = calculateShopMonthlyRecurringRevenueUsd({
    stripePricingModel: data.stripe_pricing_model,
    subscriptionPackage: data.subscription_package,
    billableUserCount: data.billable_user_count,
  });
  return calculateAIFairUseBudgetUsd({ monthlyRecurringRevenueUsd });
}
