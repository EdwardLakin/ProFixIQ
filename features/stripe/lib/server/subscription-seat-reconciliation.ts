import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  ADDITIONAL_SEAT_LOOKUP_KEY,
  BASE_PRICE_LOOKUP_KEY,
  calculateMonthlySubscriptionPrice,
  getAdditionalSeatQuantity,
  shouldUseUnlimitedPrice,
  UNLIMITED_PRICE_LOOKUP_KEY,
} from "@/features/stripe/lib/stripe/billing-model";
import { LEGACY_PLAN_LOOKUP_KEYS } from "@/features/stripe/lib/stripe/constants";

type DB = Database;

type ShopBillingSeatRow = {
  id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  billable_user_count: number | null;
};

type StripePriceContract = {
  basePriceId: string;
  additionalSeatPriceId: string;
  unlimitedPriceId: string;
};

export type SeatReconciliationState =
  | "updated"
  | "already_synced"
  | "dry_run"
  | "shop_not_found"
  | "no_subscription"
  | "subscription_not_billable"
  | "unrecognized_subscription";

export type SeatReconciliationResult = {
  state: SeatReconciliationState;
  shop_id: string;
  subscription_id: string | null;
  active_users: number;
  included_users: number;
  additional_seat_quantity: number;
  target_plan: "starter" | "unlimited";
  estimated_monthly_price: number;
  current_monthly_price: number | null;
  update_applied: boolean;
  proration_behavior: "always_invoice" | "none";
  reason?: string;
};

function configuredPriceId(names: readonly string[]): string {
  for (const name of names) {
    const value = String(process.env[name] ?? "").trim();
    if (!value) continue;
    if (!/^price_[A-Za-z0-9]+$/.test(value)) {
      throw new Error(`Invalid ${name}`);
    }
    return value;
  }
  throw new Error(`Missing ${names.join(" or ")}`);
}

function getPriceContract(): StripePriceContract {
  return {
    basePriceId: configuredPriceId([
      "STRIPE_PRICE_BASE_MONTHLY",
      "STRIPE_PRICE_STARTER_MONTHLY",
    ]),
    additionalSeatPriceId: configuredPriceId([
      "STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY",
    ]),
    unlimitedPriceId: configuredPriceId([
      "STRIPE_PRICE_UNLIMITED_MONTHLY",
    ]),
  };
}

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isSeatPrice(price: Stripe.Price, contract: StripePriceContract): boolean {
  return (
    price.id === contract.additionalSeatPriceId ||
    normalize(price.lookup_key) === ADDITIONAL_SEAT_LOOKUP_KEY
  );
}

function isRecognizedPrimaryPrice(
  price: Stripe.Price,
  contract: StripePriceContract,
): boolean {
  const lookupKey = normalize(price.lookup_key);
  return (
    price.id === contract.basePriceId ||
    price.id === contract.unlimitedPriceId ||
    lookupKey === BASE_PRICE_LOOKUP_KEY ||
    lookupKey === UNLIMITED_PRICE_LOOKUP_KEY ||
    lookupKey === LEGACY_PLAN_LOOKUP_KEYS.starter ||
    lookupKey === LEGACY_PLAN_LOOKUP_KEYS.pro ||
    lookupKey === LEGACY_PLAN_LOOKUP_KEYS.unlimited
  );
}

function monthlyAmount(subscription: Stripe.Subscription): number | null {
  let cents = 0;
  for (const item of subscription.items.data) {
    const amount = item.price.unit_amount;
    if (typeof amount !== "number") return null;
    const recurring = item.price.recurring;
    if (!recurring || recurring.interval !== "month" || recurring.interval_count !== 1) {
      return null;
    }
    cents += amount * Math.max(1, item.quantity ?? 1);
  }
  return cents / 100;
}

async function countBillableUsers(
  supabase: SupabaseClient<DB>,
  shopId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId);
  if (error) throw new Error(error.message);
  return typeof count === "number" ? count : 0;
}

async function persistSyncFailure(
  supabase: SupabaseClient<DB>,
  shopId: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : "Unknown Stripe seat sync error";
  await supabase
    .from("shops")
    .update({
      stripe_billing_sync_required: true,
      stripe_billing_sync_error: message.slice(0, 1000),
    } as DB["public"]["Tables"]["shops"]["Update"])
    .eq("id", shopId);
}

export async function reconcileShopSubscriptionSeats(params: {
  stripe: Stripe;
  supabase: SupabaseClient<DB>;
  shopId: string;
  applyUpdate?: boolean;
}): Promise<SeatReconciliationResult> {
  const { stripe, supabase, shopId, applyUpdate = true } = params;

  try {
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select(
        "id, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, billable_user_count",
      )
      .eq("id", shopId)
      .maybeSingle<ShopBillingSeatRow>();
    if (shopError) throw new Error(shopError.message);

    if (!shop) {
      return {
        state: "shop_not_found",
        shop_id: shopId,
        subscription_id: null,
        active_users: 0,
        included_users: 10,
        additional_seat_quantity: 0,
        target_plan: "starter",
        estimated_monthly_price: 299,
        current_monthly_price: null,
        update_applied: false,
        proration_behavior: "none",
        reason: "shop_not_found",
      };
    }

    const activeUsers = await countBillableUsers(supabase, shopId);
    const useUnlimited = shouldUseUnlimitedPrice(activeUsers);
    const targetPlan = useUnlimited ? "unlimited" : "starter";
    const additionalSeatQuantity = useUnlimited
      ? 0
      : getAdditionalSeatQuantity(activeUsers);
    const estimatedMonthlyPrice = calculateMonthlySubscriptionPrice(activeUsers);
    const subscriptionId = String(shop.stripe_subscription_id ?? "").trim();

    if (!subscriptionId) {
      return {
        state: "no_subscription",
        shop_id: shopId,
        subscription_id: null,
        active_users: activeUsers,
        included_users: 10,
        additional_seat_quantity: additionalSeatQuantity,
        target_plan: targetPlan,
        estimated_monthly_price: estimatedMonthlyPrice,
        current_monthly_price: null,
        update_applied: false,
        proration_behavior: "none",
        reason: "shop_has_no_subscription",
      };
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (!["active", "trialing", "past_due"].includes(subscription.status)) {
      return {
        state: "subscription_not_billable",
        shop_id: shopId,
        subscription_id: subscription.id,
        active_users: activeUsers,
        included_users: 10,
        additional_seat_quantity: additionalSeatQuantity,
        target_plan: targetPlan,
        estimated_monthly_price: estimatedMonthlyPrice,
        current_monthly_price: monthlyAmount(subscription),
        update_applied: false,
        proration_behavior: "none",
        reason: `subscription_status_${subscription.status}`,
      };
    }

    const contract = getPriceContract();
    const primaryItems = subscription.items.data.filter((item) =>
      isRecognizedPrimaryPrice(item.price, contract),
    );
    const seatItems = subscription.items.data.filter((item) =>
      isSeatPrice(item.price, contract),
    );
    const primaryItem = primaryItems[0] ?? null;
    const seatItem = seatItems[0] ?? null;

    if (!primaryItem) {
      return {
        state: "unrecognized_subscription",
        shop_id: shopId,
        subscription_id: subscription.id,
        active_users: activeUsers,
        included_users: 10,
        additional_seat_quantity: additionalSeatQuantity,
        target_plan: targetPlan,
        estimated_monthly_price: estimatedMonthlyPrice,
        current_monthly_price: monthlyAmount(subscription),
        update_applied: false,
        proration_behavior: "none",
        reason: "subscription_has_no_recognized_primary_price",
      };
    }

    const targetPrimaryPriceId = useUnlimited
      ? contract.unlimitedPriceId
      : contract.basePriceId;
    const primaryMatches =
      primaryItem.price.id === targetPrimaryPriceId &&
      (primaryItem.quantity ?? 1) === 1;
    const seatMatches = useUnlimited
      ? seatItems.length === 0
      : additionalSeatQuantity === 0
        ? seatItems.length === 0
        : seatItems.length === 1 &&
          seatItem?.price.id === contract.additionalSeatPriceId &&
          (seatItem.quantity ?? 0) === additionalSeatQuantity;
    const noDuplicatePrimary = primaryItems.length === 1;
    const currentMonthlyPrice = monthlyAmount(subscription);
    const alreadySynced = primaryMatches && seatMatches && noDuplicatePrimary;
    const prorationBehavior: "always_invoice" | "none" =
      currentMonthlyPrice !== null && estimatedMonthlyPrice > currentMonthlyPrice
        ? "always_invoice"
        : "none";

    if (alreadySynced) {
      if (applyUpdate) {
        const { error } = await supabase
          .from("shops")
          .update({
            billable_user_count: activeUsers,
            active_user_count: activeUsers,
            plan: targetPlan,
            stripe_pricing_model: "base_plus_seats_v2",
            stripe_billing_sync_required: false,
            stripe_billing_sync_error: null,
            stripe_billing_synced_at: new Date().toISOString(),
          } as DB["public"]["Tables"]["shops"]["Update"])
          .eq("id", shopId);
        if (error) throw new Error(error.message);
      }
      return {
        state: applyUpdate ? "already_synced" : "dry_run",
        shop_id: shopId,
        subscription_id: subscription.id,
        active_users: activeUsers,
        included_users: 10,
        additional_seat_quantity: additionalSeatQuantity,
        target_plan: targetPlan,
        estimated_monthly_price: estimatedMonthlyPrice,
        current_monthly_price: currentMonthlyPrice,
        update_applied: false,
        proration_behavior: prorationBehavior,
        reason: "subscription_items_match_target",
      };
    }

    if (!applyUpdate) {
      return {
        state: "dry_run",
        shop_id: shopId,
        subscription_id: subscription.id,
        active_users: activeUsers,
        included_users: 10,
        additional_seat_quantity: additionalSeatQuantity,
        target_plan: targetPlan,
        estimated_monthly_price: estimatedMonthlyPrice,
        current_monthly_price: currentMonthlyPrice,
        update_applied: false,
        proration_behavior: prorationBehavior,
        reason: "subscription_update_required",
      };
    }

    const items: Stripe.SubscriptionUpdateParams.Item[] = [
      {
        id: primaryItem.id,
        price: targetPrimaryPriceId,
        quantity: 1,
      },
    ];

    for (const duplicate of primaryItems.slice(1)) {
      items.push({ id: duplicate.id, deleted: true });
    }

    if (useUnlimited || additionalSeatQuantity === 0) {
      for (const existingSeat of seatItems) {
        items.push({ id: existingSeat.id, deleted: true });
      }
    } else if (seatItem) {
      items.push({
        id: seatItem.id,
        price: contract.additionalSeatPriceId,
        quantity: additionalSeatQuantity,
      });
      for (const duplicate of seatItems.slice(1)) {
        items.push({ id: duplicate.id, deleted: true });
      }
    } else {
      items.push({
        price: contract.additionalSeatPriceId,
        quantity: additionalSeatQuantity,
      });
    }

    const updated = await stripe.subscriptions.update(
      subscription.id,
      {
        items,
        proration_behavior: prorationBehavior,
        metadata: {
          ...(subscription.metadata ?? {}),
          app: "profixiq",
          shop_id: shopId,
          pricing_model: "base_plus_seats_v2",
          plan_key: targetPlan,
          billable_user_count: String(activeUsers),
          included_user_count: "10",
          additional_seat_quantity: String(additionalSeatQuantity),
          estimated_monthly_price: String(estimatedMonthlyPrice),
        },
      },
      {
        idempotencyKey: `profixiq:seat-sync:${shopId}:${subscription.current_period_start}:${activeUsers}:${targetPlan}`,
      },
    );

    const { error: updateError } = await supabase
      .from("shops")
      .update({
        stripe_subscription_id: updated.id,
        billable_user_count: activeUsers,
        active_user_count: activeUsers,
        plan: targetPlan,
        stripe_pricing_model: "base_plus_seats_v2",
        stripe_billing_sync_required: false,
        stripe_billing_sync_error: null,
        stripe_billing_synced_at: new Date().toISOString(),
      } as DB["public"]["Tables"]["shops"]["Update"])
      .eq("id", shopId);
    if (updateError) throw new Error(updateError.message);

    return {
      state: "updated",
      shop_id: shopId,
      subscription_id: updated.id,
      active_users: activeUsers,
      included_users: 10,
      additional_seat_quantity: additionalSeatQuantity,
      target_plan: targetPlan,
      estimated_monthly_price: estimatedMonthlyPrice,
      current_monthly_price: currentMonthlyPrice,
      update_applied: true,
      proration_behavior: prorationBehavior,
      reason: "subscription_items_reconciled",
    };
  } catch (error) {
    await persistSyncFailure(supabase, shopId, error);
    throw error;
  }
}
