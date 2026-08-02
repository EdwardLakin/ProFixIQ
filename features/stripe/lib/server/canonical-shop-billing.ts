import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  parseStripeSubscriptionStatus,
  type StripeSubscriptionStatus,
} from "@/features/stripe/lib/stripe/subscriptionStatus";
import {
  LEGACY_PLAN_LOOKUP_KEYS,
  PLAN_LOOKUP_KEYS,
} from "@/features/stripe/lib/stripe/constants";
import {
  ADDITIONAL_SEAT_LOOKUP_KEY,
} from "@/features/stripe/lib/stripe/billing-model";
import {
  normalizeCanonicalPlan,
  type CanonicalPlan,
} from "@/features/stripe/lib/stripe/plan-normalization";
import { collectCustomerSubscriptionDiagnostics } from "@/features/stripe/lib/server/subscription-discovery";

type DB = Database;

type ProfileStripeArtifacts = {
  shop_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
};

function unixToIsoOrNull(v: number | null | undefined): string | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return new Date(v * 1000).toISOString();
}

function toShopStripeStatus(v: unknown): StripeSubscriptionStatus | null {
  const parsed = parseStripeSubscriptionStatus(v);
  return parsed === "unknown" ? null : parsed;
}

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function planFromLookupKey(lookupKey: string | null | undefined): CanonicalPlan | null {
  const value = normalize(lookupKey);
  if (!value || value === ADDITIONAL_SEAT_LOOKUP_KEY) return null;
  if (value === PLAN_LOOKUP_KEYS.unlimited || value === LEGACY_PLAN_LOOKUP_KEYS.unlimited) {
    return "unlimited";
  }
  if (
    value === PLAN_LOOKUP_KEYS.starter ||
    value === LEGACY_PLAN_LOOKUP_KEYS.starter ||
    value === LEGACY_PLAN_LOOKUP_KEYS.pro
  ) {
    return "starter";
  }
  return null;
}

function envPriceIds(names: readonly string[]): Set<string> {
  return new Set(
    names
      .map((name) => String(process.env[name] ?? "").trim())
      .filter(Boolean),
  );
}

function planFromPriceId(priceId: string | null | undefined): CanonicalPlan | null {
  const value = String(priceId ?? "").trim();
  if (!value) return null;

  if (envPriceIds(["STRIPE_PRICE_UNLIMITED_MONTHLY"]).has(value)) return "unlimited";
  if (
    envPriceIds([
      "STRIPE_PRICE_BASE_MONTHLY",
      "STRIPE_PRICE_STARTER_MONTHLY",
      "STRIPE_PRICE_PRO_MONTHLY",
    ]).has(value)
  ) {
    return "starter";
  }
  return null;
}

function planFromPriceNickname(nickname: string | null | undefined): CanonicalPlan | null {
  const value = normalize(nickname);
  if (!value || value.includes("seat")) return null;
  if (value.includes("unlimited")) return "unlimited";
  if (
    value.includes("base") ||
    value.includes("starter") ||
    value.includes("complete") ||
    value.includes("pro")
  ) {
    return "starter";
  }
  return null;
}

function isV2Price(price: Stripe.Price): boolean {
  const lookupKey = normalize(price.lookup_key);
  return (
    lookupKey === PLAN_LOOKUP_KEYS.starter ||
    lookupKey === PLAN_LOOKUP_KEYS.unlimited ||
    lookupKey === ADDITIONAL_SEAT_LOOKUP_KEY
  );
}

export function resolveCanonicalPlanFromSubscription(
  subscription: Stripe.Subscription,
): CanonicalPlan | null {
  let starterFound = false;

  for (const item of subscription.items.data) {
    const price = item.price;
    const resolved =
      planFromPriceId(price.id) ??
      planFromLookupKey(price.lookup_key) ??
      planFromPriceNickname(price.nickname);

    if (resolved === "unlimited") return "unlimited";
    if (resolved === "starter") starterFound = true;
  }

  return starterFound ? "starter" : normalizeCanonicalPlan(subscription.metadata?.plan_key);
}

export function toCanonicalShopBillingUpdate(args: {
  customerId: string | null;
  subscription: Stripe.Subscription;
  checkoutSessionId?: string | null;
}): DB["public"]["Tables"]["shops"]["Update"] {
  const { customerId, subscription, checkoutSessionId } = args;
  const resolvedPlan = normalizeCanonicalPlan(
    resolveCanonicalPlanFromSubscription(subscription),
  );
  const pricingModel =
    subscription.metadata?.pricing_model === "base_plus_seats_v2" ||
    subscription.items.data.some((item) => isV2Price(item.price))
      ? "base_plus_seats_v2"
      : "legacy";

  return {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    stripe_subscription_status: toShopStripeStatus(subscription.status),
    stripe_trial_end: unixToIsoOrNull(subscription.trial_end ?? null),
    stripe_current_period_end: unixToIsoOrNull(subscription.current_period_end ?? null),
    stripe_pricing_model: pricingModel,
    plan: resolvedPlan,
    ...(checkoutSessionId ? { stripe_checkout_session_id: checkoutSessionId } : {}),
  } as unknown as DB["public"]["Tables"]["shops"]["Update"];
}

export async function getProfileStripeArtifacts(
  supabase: SupabaseClient<DB>,
  userId: string,
): Promise<ProfileStripeArtifacts | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("shop_id, stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id")
    .eq("id", userId)
    .maybeSingle<ProfileStripeArtifacts>();

  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function syncCanonicalShopBilling(params: {
  stripe: Stripe;
  supabase: SupabaseClient<DB>;
  shopId: string;
  customerId: string | null;
  subscriptionId: string;
  checkoutSessionId?: string | null;
  webhookEvent?: { id: string; createdAt: string };
}): Promise<{ applied: boolean }> {
  const {
    stripe,
    supabase,
    shopId,
    customerId,
    subscriptionId,
    checkoutSessionId,
    webhookEvent,
  } = params;
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const update = toCanonicalShopBillingUpdate({
    customerId,
    subscription: sub,
    checkoutSessionId,
  });

  if (webhookEvent) {
    if (!customerId) {
      throw new Error("Stripe subscription webhook is missing its customer identity");
    }
    const { data, error } = await supabase.rpc("apply_stripe_subscription_webhook_snapshot", {
      p_shop_id: shopId,
      p_customer_id: customerId,
      p_subscription_id: sub.id,
      p_event_id: webhookEvent.id,
      p_event_created_at: webhookEvent.createdAt,
      p_snapshot: {
        stripe_subscription_status: update.stripe_subscription_status ?? null,
        stripe_trial_end: update.stripe_trial_end ?? null,
        stripe_current_period_end: update.stripe_current_period_end ?? null,
        stripe_pricing_model: update.stripe_pricing_model ?? null,
        plan: update.plan ?? null,
        stripe_checkout_session_id: checkoutSessionId ?? null,
      },
    });
    if (error) throw new Error(error.message);
    return { applied: data === true };
  }

  const { error } = await supabase.from("shops").update(update).eq("id", shopId);
  if (error) throw new Error(error.message);
  return { applied: true };
}

export async function reconcileShopBillingFromUser(params: {
  stripe: Stripe;
  supabase: SupabaseClient<DB>;
  userId: string;
  shopId: string;
}): Promise<{ linked: boolean; reason?: string }> {
  const { stripe, supabase, userId, shopId } = params;
  const profile = await getProfileStripeArtifacts(supabase, userId);
  if (!profile) return { linked: false, reason: "profile_not_found" };

  let profileCustomerId = String(profile.stripe_customer_id ?? "").trim();
  let profileSubscriptionId = String(profile.stripe_subscription_id ?? "").trim();
  const profileCheckoutSessionId = String(profile.stripe_checkout_session_id ?? "").trim();

  if (!profileCustomerId && !profileSubscriptionId && profileCheckoutSessionId) {
    const checkoutSession = await stripe.checkout.sessions.retrieve(profileCheckoutSessionId);
    if (checkoutSession.mode === "subscription") {
      profileCustomerId =
        (typeof checkoutSession.customer === "string" ? checkoutSession.customer : "") || "";
      profileSubscriptionId =
        (typeof checkoutSession.subscription === "string" ? checkoutSession.subscription : "") || "";
    }
  }

  if (!profileCustomerId && !profileSubscriptionId) {
    return { linked: false, reason: "no_profile_stripe_artifacts" };
  }

  let customerId = profileCustomerId || null;
  let subscriptionId = profileSubscriptionId;

  if (!subscriptionId && customerId) {
    const diagnostics = await collectCustomerSubscriptionDiagnostics({ stripe, customerId });
    if (diagnostics.managed_subscription_ids.length === 1) {
      subscriptionId = diagnostics.managed_subscription_ids[0] ?? "";
    } else if (
      diagnostics.managed_subscription_ids.length === 0 &&
      diagnostics.single_hydratable_subscription_id
    ) {
      subscriptionId = diagnostics.single_hydratable_subscription_id;
    } else if (diagnostics.managed_subscription_ids.length === 0) {
      return { linked: false, reason: "no_subscription_found" };
    } else {
      return { linked: false, reason: "ambiguous_customer_subscriptions" };
    }
  }

  if (!subscriptionId) return { linked: false, reason: "no_subscription_found" };

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  customerId =
    customerId ||
    (typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null);

  if (customerId) {
    await stripe.customers.update(
      customerId,
      {
        metadata: {
          app: "profixiq",
          shop_id: shopId,
          supabase_user_id: userId,
          source: "profixiq",
        },
      },
      { idempotencyKey: `profixiq:reconcile-customer:${userId}:${shopId}` },
    );
  }

  await stripe.subscriptions.update(
    subscriptionId,
    {
      metadata: {
        ...(subscription.metadata ?? {}),
        app: "profixiq",
        shop_id: shopId,
        supabase_user_id: userId,
        source: "profixiq",
      },
    },
    { idempotencyKey: `profixiq:reconcile-subscription:${userId}:${shopId}` },
  );

  await syncCanonicalShopBilling({
    stripe,
    supabase,
    shopId,
    customerId,
    subscriptionId,
  });

  return { linked: true };
}
