import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { PLAN_LIMITS } from "@/features/stripe/lib/stripe/constants";
import { normalizeCanonicalPlan, type CanonicalPlan } from "@/features/stripe/lib/stripe/plan-normalization";

type SeatPlanSource = "shop.plan" | "trial-default" | "safe-default";

type SeatLimitSnapshot = {
  plan: CanonicalPlan;
  cap: number;
  activeUsers: number;
  source: SeatPlanSource;
};

const DEFAULT_TRIAL_PLAN: CanonicalPlan = "starter";
const DEFAULT_SAFE_PLAN: CanonicalPlan = "starter";

function resolvePlan(args: {
  rawPlan: unknown;
  stripeStatus: unknown;
}): { plan: CanonicalPlan; source: SeatPlanSource } {
  const fromShop = normalizeCanonicalPlan(args.rawPlan);
  if (fromShop) return { plan: fromShop, source: "shop.plan" };

  const normalizedStripeStatus = String(args.stripeStatus ?? "").trim().toLowerCase();
  if (normalizedStripeStatus === "trialing") {
    return { plan: DEFAULT_TRIAL_PLAN, source: "trial-default" };
  }

  return { plan: DEFAULT_SAFE_PLAN, source: "safe-default" };
}

export async function getShopSeatLimitSnapshot(
  admin: SupabaseClient<Database>,
  shopId: string,
): Promise<SeatLimitSnapshot> {
  const { data: shop, error: shopErr } = await admin
    .from("shops")
    .select("plan, stripe_subscription_status")
    .eq("id", shopId)
    .maybeSingle<{ plan: string | null; stripe_subscription_status: string | null }>();

  if (shopErr) {
    throw new Error(`Failed to resolve shop plan: ${shopErr.message}`);
  }

  const resolved = resolvePlan({
    rawPlan: shop?.plan ?? null,
    stripeStatus: shop?.stripe_subscription_status ?? null,
  });

  const { count: activeUsers, error: countErr } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("is_active", true);

  if (countErr) {
    throw new Error(`Failed to count active shop users: ${countErr.message}`);
  }

  return {
    plan: resolved.plan,
    cap: PLAN_LIMITS[resolved.plan],
    activeUsers: typeof activeUsers === "number" ? activeUsers : 0,
    source: resolved.source,
  };
}

export async function assertShopHasAvailableSeat(
  admin: SupabaseClient<Database>,
  shopId: string,
): Promise<void> {
  const snapshot = await getShopSeatLimitSnapshot(admin, shopId);
  if (snapshot.activeUsers >= snapshot.cap) {
    console.warn("[create-user] seat limit reached", {
      shopId,
      plan: snapshot.plan,
      planSource: snapshot.source,
      activeUsers: snapshot.activeUsers,
      cap: snapshot.cap,
    });
    throw new Error("Shop user limit reached for your current plan.");
  }
}
