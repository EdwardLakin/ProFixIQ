import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  calculateMonthlySubscriptionPrice,
  getAdditionalSeatQuantity,
  INCLUDED_USERS,
  shouldUseUnlimitedPrice,
} from "@/features/stripe/lib/stripe/billing-model";
import {
  normalizeCanonicalPlan,
  type CanonicalPlan,
} from "@/features/stripe/lib/stripe/plan-normalization";

type SeatPlanSource = "shop.plan" | "trial-default" | "safe-default";

type SeatLimitSnapshot = {
  plan: CanonicalPlan;
  cap: number;
  activeUsers: number;
  includedUsers: number;
  additionalSeats: number;
  estimatedMonthlyPrice: number;
  usesUnlimitedPrice: boolean;
  source: SeatPlanSource;
};

const DEFAULT_PLAN: CanonicalPlan = "starter";

function resolvePlan(args: {
  rawPlan: unknown;
  stripeStatus: unknown;
}): { plan: CanonicalPlan; source: SeatPlanSource } {
  const fromShop = normalizeCanonicalPlan(args.rawPlan);
  if (fromShop) return { plan: fromShop, source: "shop.plan" };

  const normalizedStripeStatus = String(args.stripeStatus ?? "").trim().toLowerCase();
  if (normalizedStripeStatus === "trialing") {
    return { plan: DEFAULT_PLAN, source: "trial-default" };
  }

  return { plan: DEFAULT_PLAN, source: "safe-default" };
}

export async function getShopSeatLimitSnapshot(
  admin: SupabaseClient<Database>,
  shopId: string,
): Promise<SeatLimitSnapshot> {
  const { data: shop, error: shopErr } = await admin
    .from("shops")
    .select("plan, stripe_subscription_status, billable_user_count")
    .eq("id", shopId)
    .maybeSingle<{
      plan: string | null;
      stripe_subscription_status: string | null;
      billable_user_count?: number | null;
    }>();

  if (shopErr) {
    throw new Error(`Failed to resolve shop plan: ${shopErr.message}`);
  }

  const resolved = resolvePlan({
    rawPlan: shop?.plan ?? null,
    stripeStatus: shop?.stripe_subscription_status ?? null,
  });

  let activeUsers =
    typeof shop?.billable_user_count === "number" ? shop.billable_user_count : null;

  if (activeUsers === null) {
    const { count, error: countErr } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId);

    if (countErr) {
      throw new Error(`Failed to count shop users: ${countErr.message}`);
    }
    activeUsers = typeof count === "number" ? count : 0;
  }

  const usesUnlimitedPrice =
    resolved.plan === "unlimited" || shouldUseUnlimitedPrice(activeUsers);

  return {
    plan: usesUnlimitedPrice ? "unlimited" : "starter",
    cap: Number.MAX_SAFE_INTEGER,
    activeUsers,
    includedUsers: INCLUDED_USERS,
    additionalSeats: usesUnlimitedPrice ? 0 : getAdditionalSeatQuantity(activeUsers),
    estimatedMonthlyPrice: calculateMonthlySubscriptionPrice(activeUsers),
    usesUnlimitedPrice,
    source: resolved.source,
  };
}

/**
 * The current commercial model never blocks staff creation. Staff above the
 * included ten seats are reconciled to Stripe and the subscription caps at the
 * unlimited price once the shop reaches the unlimited threshold.
 */
export async function assertShopHasAvailableSeat(
  admin: SupabaseClient<Database>,
  shopId: string,
): Promise<void> {
  const snapshot = await getShopSeatLimitSnapshot(admin, shopId);
  if (snapshot.activeUsers >= snapshot.includedUsers) {
    console.info("[create-user] billable seat will be reconciled", {
      shopId,
      activeUsers: snapshot.activeUsers,
      nextUserCount: snapshot.activeUsers + 1,
      estimatedMonthlyPrice: calculateMonthlySubscriptionPrice(snapshot.activeUsers + 1),
    });
  }
}
