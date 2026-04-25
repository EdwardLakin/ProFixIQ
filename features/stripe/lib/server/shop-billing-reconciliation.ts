import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { toCanonicalShopBillingUpdate } from "@/features/stripe/lib/server/canonical-shop-billing";

type DB = Database;

type ShopBillingRow = Pick<
  DB["public"]["Tables"]["shops"]["Row"],
  | "id"
  | "stripe_customer_id"
  | "stripe_subscription_id"
  | "stripe_subscription_status"
  | "stripe_trial_end"
  | "stripe_current_period_end"
  | "plan"
>;

const MANAGED_SUBSCRIPTION_STATUSES = new Set([
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused",
]);

export type ShopBillingReconciliationState =
  | "updated"
  | "already_hydrated"
  | "no_subscription_found"
  | "ambiguous_customer_subscriptions"
  | "shop_not_found"
  | "missing_customer_id"
  | "customer_id_mismatch";

export type ShopBillingReconciliationResult = {
  state: ShopBillingReconciliationState;
  shop_id: string;
  stripe_customer_id: string | null;
  qualifying_subscription_ids: string[];
  chosen_subscription_id: string | null;
  derived_plan: string | null;
  update_applied: boolean;
  reason?: string;
};

function normalizeText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function isSameCanonicalState(
  shop: ShopBillingRow,
  update: DB["public"]["Tables"]["shops"]["Update"],
): boolean {
  return (
    normalizeText(shop.stripe_subscription_id) === normalizeText(update.stripe_subscription_id) &&
    normalizeText(shop.stripe_subscription_status) === normalizeText(update.stripe_subscription_status) &&
    normalizeText(shop.stripe_trial_end) === normalizeText(update.stripe_trial_end) &&
    normalizeText(shop.stripe_current_period_end) === normalizeText(update.stripe_current_period_end) &&
    normalizeText(shop.plan) === normalizeText(update.plan)
  );
}

export async function reconcileCanonicalShopBillingByShopId(params: {
  stripe: Stripe;
  supabase: SupabaseClient<DB>;
  shopId: string;
  expectedCustomerId?: string | null;
  applyUpdate?: boolean;
}): Promise<ShopBillingReconciliationResult> {
  const { stripe, supabase, shopId, expectedCustomerId = null, applyUpdate = true } = params;

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select(
      "id, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_trial_end, stripe_current_period_end, plan",
    )
    .eq("id", shopId)
    .maybeSingle<ShopBillingRow>();

  if (shopError) {
    throw new Error(shopError.message);
  }

  if (!shop) {
    return {
      state: "shop_not_found",
      shop_id: shopId,
      stripe_customer_id: null,
      qualifying_subscription_ids: [],
      chosen_subscription_id: null,
      derived_plan: null,
      update_applied: false,
      reason: "shop_not_found",
    };
  }

  const stripeCustomerId = normalizeText(shop.stripe_customer_id);
  if (!stripeCustomerId) {
    return {
      state: "missing_customer_id",
      shop_id: shop.id,
      stripe_customer_id: null,
      qualifying_subscription_ids: [],
      chosen_subscription_id: null,
      derived_plan: null,
      update_applied: false,
      reason: "missing_customer_id",
    };
  }

  const expected = normalizeText(expectedCustomerId);
  if (expected && expected !== stripeCustomerId) {
    return {
      state: "customer_id_mismatch",
      shop_id: shop.id,
      stripe_customer_id: stripeCustomerId,
      qualifying_subscription_ids: [],
      chosen_subscription_id: null,
      derived_plan: null,
      update_applied: false,
      reason: "customer_id_mismatch",
    };
  }

  const subscriptionList = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "all",
    limit: 20,
  });

  const qualifying = subscriptionList.data.filter((subscription) =>
    MANAGED_SUBSCRIPTION_STATUSES.has(String(subscription.status ?? "").trim().toLowerCase()),
  );

  const qualifyingIds = qualifying.map((subscription) => subscription.id);

  if (qualifying.length === 0) {
    return {
      state: "no_subscription_found",
      shop_id: shop.id,
      stripe_customer_id: stripeCustomerId,
      qualifying_subscription_ids: qualifyingIds,
      chosen_subscription_id: null,
      derived_plan: null,
      update_applied: false,
      reason: "no_subscription_found",
    };
  }

  if (qualifying.length > 1) {
    return {
      state: "ambiguous_customer_subscriptions",
      shop_id: shop.id,
      stripe_customer_id: stripeCustomerId,
      qualifying_subscription_ids: qualifyingIds,
      chosen_subscription_id: null,
      derived_plan: null,
      update_applied: false,
      reason: "ambiguous_customer_subscriptions",
    };
  }

  const chosen = qualifying[0];

  const canonicalUpdate = toCanonicalShopBillingUpdate({
    customerId: stripeCustomerId,
    subscription: chosen,
  });

  const sameState = isSameCanonicalState(shop, canonicalUpdate);
  const shouldWrite = applyUpdate && !sameState;

  if (shouldWrite) {
    const { error: updateError } = await supabase
      .from("shops")
      .update(canonicalUpdate)
      .eq("id", shop.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  return {
    state: sameState ? "already_hydrated" : "updated",
    shop_id: shop.id,
    stripe_customer_id: stripeCustomerId,
    qualifying_subscription_ids: qualifyingIds,
    chosen_subscription_id: chosen.id,
    derived_plan: normalizeText(canonicalUpdate.plan),
    update_applied: shouldWrite,
    reason: sameState ? "already_hydrated" : shouldWrite ? "canonical_shop_billing_updated" : "dry_run",
  };
}
