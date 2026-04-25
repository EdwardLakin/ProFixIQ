import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  parseStripeSubscriptionStatus,
  type StripeSubscriptionStatus,
} from "@/features/stripe/lib/stripe/subscriptionStatus";

type DB = Database;

type ProfileStripeArtifacts = {
  shop_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
};

const MANAGED_SUBSCRIPTION_STATUSES = new Set([
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused",
]);

function unixToIsoOrNull(v: number | null | undefined): string | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return new Date(v * 1000).toISOString();
}

function toShopStripeStatus(v: unknown): StripeSubscriptionStatus | null {
  const parsed = parseStripeSubscriptionStatus(v);
  return parsed === "unknown" ? null : parsed;
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

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

export async function syncCanonicalShopBilling(params: {
  stripe: Stripe;
  supabase: SupabaseClient<DB>;
  shopId: string;
  customerId: string | null;
  subscriptionId: string;
  checkoutSessionId?: string | null;
}): Promise<void> {
  const { stripe, supabase, shopId, customerId, subscriptionId, checkoutSessionId } = params;
  const sub = await stripe.subscriptions.retrieve(subscriptionId);

  const { error } = await supabase
    .from("shops")
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_subscription_status: toShopStripeStatus(sub.status),
      stripe_trial_end: unixToIsoOrNull(sub.trial_end ?? null),
      stripe_current_period_end: unixToIsoOrNull(sub.current_period_end ?? null),
      ...(checkoutSessionId ? { stripe_checkout_session_id: checkoutSessionId } : {}),
    } as unknown as DB["public"]["Tables"]["shops"]["Update"])
    .eq("id", shopId);

  if (error) {
    throw new Error(error.message);
  }
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
    const list = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
    });
    const managed = list.data.filter((sub) =>
      MANAGED_SUBSCRIPTION_STATUSES.has(String(sub.status ?? "").trim().toLowerCase()),
    );

    if (managed.length === 1) {
      subscriptionId = managed[0]?.id ?? "";
    } else if (managed.length === 0) {
      return { linked: false, reason: "no_subscription_found" };
    } else {
      return { linked: false, reason: "ambiguous_customer_subscriptions" };
    }
  }

  if (!subscriptionId) {
    return { linked: false, reason: "no_subscription_found" };
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  customerId =
    customerId ||
    (typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null);

  if (customerId) {
    await stripe.customers.update(customerId, {
      metadata: {
        shop_id: shopId,
        supabase_user_id: userId,
        source: "profixiq",
      },
    });
  }

  await stripe.subscriptions.update(subscriptionId, {
    metadata: {
      ...(subscription.metadata ?? {}),
      shop_id: shopId,
      supabase_user_id: userId,
      source: "profixiq",
    },
  });

  await syncCanonicalShopBilling({
    stripe,
    supabase,
    shopId,
    customerId,
    subscriptionId,
  });

  return { linked: true };
}

export async function reconcileShopBillingFromCheckoutSession(params: {
  stripe: Stripe;
  supabase: SupabaseClient<DB>;
  userId: string;
  shopId: string;
  sessionId: string;
}): Promise<{ linked: boolean; reason?: string }> {
  const { stripe, supabase, userId, shopId, sessionId } = params;
  const trimmedSessionId = sessionId.trim();
  if (!trimmedSessionId.startsWith("cs_")) {
    return { linked: false, reason: "invalid_checkout_session_id" };
  }

  const session = await stripe.checkout.sessions.retrieve(trimmedSessionId);
  if (session.mode !== "subscription") {
    return { linked: false, reason: "not_subscription_checkout" };
  }

  const sessionCustomerId =
    typeof session.customer === "string" ? session.customer : null;
  const sessionSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;

  if (!sessionCustomerId && !sessionSubscriptionId) {
    return { linked: false, reason: "session_missing_billing_artifacts" };
  }

  const metadataUserId = String(session.metadata?.supabase_user_id ?? "").trim();
  if (metadataUserId && metadataUserId !== userId) {
    return { linked: false, reason: "session_user_mismatch" };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      stripe_checkout_complete: true,
      stripe_checkout_session_id: session.id,
      stripe_customer_id: sessionCustomerId,
      stripe_subscription_id: sessionSubscriptionId,
    } as unknown as DB["public"]["Tables"]["profiles"]["Update"])
    .eq("id", userId);

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (sessionCustomerId) {
    await stripe.customers.update(sessionCustomerId, {
      metadata: {
        shop_id: shopId,
        supabase_user_id: userId,
        source: "profixiq",
      },
    });
  }

  if (sessionSubscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(sessionSubscriptionId);
    await stripe.subscriptions.update(sessionSubscriptionId, {
      metadata: {
        ...(subscription.metadata ?? {}),
        shop_id: shopId,
        supabase_user_id: userId,
        source: "profixiq",
      },
    });
  }

  if (sessionSubscriptionId) {
    await syncCanonicalShopBilling({
      stripe,
      supabase,
      shopId,
      customerId: sessionCustomerId,
      subscriptionId: sessionSubscriptionId,
      checkoutSessionId: session.id,
    });
    return { linked: true };
  }

  return { linked: false, reason: "no_subscription_found" };
}
