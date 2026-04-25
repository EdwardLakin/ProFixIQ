export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { OWNER_PIN_PURPOSES } from "@/features/shared/lib/server/owner-pin";
import { getProfileStripeArtifacts } from "@/features/stripe/lib/server/canonical-shop-billing";

type DB = Database;

type ShopStripeScope = Pick<
  DB["public"]["Tables"]["shops"]["Row"],
  | "id"
  | "stripe_customer_id"
  | "stripe_subscription_id"
  | "stripe_subscription_status"
  | "stripe_current_period_end"
  | "stripe_trial_end"
>;

type NormalizedSubscriptionPayload = {
  success: boolean;
  status: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  linkage_needed?: boolean;
  linkage_state?: "unlinked_subscription" | "no_subscription_found" | "ambiguous_customer_subscriptions";
  linked_customer_id?: string | null;
  linked_subscription_id?: string | null;
  linked_checkout_session_id?: string | null;
  managed_subscription_ids?: string[];
};

type CanonicalSubscriptionResolution =
  | { state: "resolved"; subscription: Stripe.Subscription }
  | { state: "no_subscription_found" }
  | { state: "ambiguous_customer_subscriptions"; subscriptionIds: string[] };

const MANAGED_SUBSCRIPTION_STATUSES = new Set(["trialing", "active", "past_due", "unpaid", "paused"]);

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function unixToIsoOrNull(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return new Date(value * 1000).toISOString();
}

function normalizeSubscription(subscription: Stripe.Subscription): NormalizedSubscriptionPayload {
  return {
    success: true,
    status: String(subscription.status ?? "").trim() || null,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    canceled_at: unixToIsoOrNull(subscription.canceled_at ?? null),
    current_period_end: unixToIsoOrNull(subscription.current_period_end ?? null),
    trial_end: unixToIsoOrNull(subscription.trial_end ?? null),
  };
}

function normalizeShopFallback(shop: ShopStripeScope): NormalizedSubscriptionPayload {
  return {
    success: true,
    status: String(shop.stripe_subscription_status ?? "").trim() || null,
    cancel_at_period_end: false,
    canceled_at: null,
    current_period_end: shop.stripe_current_period_end ?? null,
    trial_end: shop.stripe_trial_end ?? null,
  };
}

function subscriptionMatchesShop(subscription: Stripe.Subscription, shop: ShopStripeScope): boolean {
  const customerId = String(shop.stripe_customer_id ?? "").trim();
  const subscriptionCustomerId =
    typeof subscription.customer === "string" ? subscription.customer : String(subscription.customer?.id ?? "").trim();
  const metadataShopId = String(subscription.metadata?.shop_id ?? "").trim();
  const customerMatches = !customerId || subscriptionCustomerId === customerId;
  const metadataMatches = metadataShopId === "" || metadataShopId === shop.id;
  return customerMatches && metadataMatches;
}

async function findCanonicalSubscription(
  stripe: Stripe,
  shop: ShopStripeScope,
): Promise<CanonicalSubscriptionResolution> {
  const subscriptionId = String(shop.stripe_subscription_id ?? "").trim();
  const customerId = String(shop.stripe_customer_id ?? "").trim();

  if (subscriptionId) {
    const byId = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscriptionMatchesShop(byId, shop)) {
      return { state: "resolved", subscription: byId };
    }
  }

  if (!customerId) return { state: "no_subscription_found" };

  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 20,
  });

  if (!Array.isArray(list.data) || list.data.length === 0) {
    return { state: "no_subscription_found" };
  }

  const managed = list.data.filter(
    (subscription) =>
      MANAGED_SUBSCRIPTION_STATUSES.has(String(subscription.status ?? "").trim().toLowerCase()) &&
      subscriptionMatchesShop(subscription, shop),
  );

  if (managed.length === 1) {
    return { state: "resolved", subscription: managed[0] };
  }

  if (managed.length === 0) {
    return { state: "no_subscription_found" };
  }

  const subscriptionIds = managed.map((subscription) => subscription.id);
  return {
    state: "ambiguous_customer_subscriptions",
    subscriptionIds,
  };
}

async function findUnlinkedSubscriptionEvidence(args: {
  stripe: Stripe;
  supabase: SupabaseClient<DB>;
  userId: string;
  shop: ShopStripeScope;
}): Promise<{ customerId: string | null; subscriptionId: string | null; checkoutSessionId: string | null } | null> {
  const { stripe, supabase, userId, shop } = args;
  const profile = await getProfileStripeArtifacts(supabase, userId);
  if (!profile) return null;

  const profileCustomerId = String(profile.stripe_customer_id ?? "").trim() || null;
  const profileSubscriptionId = String(profile.stripe_subscription_id ?? "").trim() || null;
  const profileCheckoutSessionId = String(profile.stripe_checkout_session_id ?? "").trim() || null;

  const canonicalCustomerId = String(shop.stripe_customer_id ?? "").trim() || null;
  const canonicalSubscriptionId = String(shop.stripe_subscription_id ?? "").trim() || null;

  if (!profileCustomerId && !profileSubscriptionId && !profileCheckoutSessionId) return null;

  if (
    profileCustomerId &&
    canonicalCustomerId &&
    profileCustomerId === canonicalCustomerId &&
    profileSubscriptionId &&
    canonicalSubscriptionId &&
    profileSubscriptionId === canonicalSubscriptionId
  ) {
    return null;
  }

  if (profileSubscriptionId) {
    const sub = await stripe.subscriptions.retrieve(profileSubscriptionId);
    const subscriptionCustomerId =
      typeof sub.customer === "string" ? sub.customer : String(sub.customer?.id ?? "").trim() || null;
    return {
      customerId: profileCustomerId ?? subscriptionCustomerId,
      subscriptionId: sub.id,
      checkoutSessionId: profileCheckoutSessionId,
    };
  }

  if (profileCustomerId) {
    const list = await stripe.subscriptions.list({
      customer: profileCustomerId,
      status: "all",
      limit: 5,
    });
    const latest = [...list.data].sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0] ?? null;
    if (latest) {
      return { customerId: profileCustomerId, subscriptionId: latest.id, checkoutSessionId: profileCheckoutSessionId };
    }
    return { customerId: profileCustomerId, subscriptionId: null, checkoutSessionId: profileCheckoutSessionId };
  }

  if (profileCheckoutSessionId) {
    const session = await stripe.checkout.sessions.retrieve(profileCheckoutSessionId);
    const customerId =
      typeof session.customer === "string" ? session.customer : null;
    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : null;
    return {
      customerId,
      subscriptionId,
      checkoutSessionId: profileCheckoutSessionId,
    };
  }

  return null;
}

async function syncShopSubscription(
  supabase: SupabaseClient<DB>,
  shopId: string,
  subscription: Stripe.Subscription,
) {
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : String(subscription.customer?.id ?? "").trim() || null;

  const { error } = await supabase
    .from("shops")
    .update({
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: subscription.id,
      stripe_subscription_status: String(subscription.status ?? "").trim() || null,
      stripe_current_period_end: unixToIsoOrNull(subscription.current_period_end ?? null),
      stripe_trial_end: unixToIsoOrNull(subscription.trial_end ?? null),
    } as DB["public"]["Tables"]["shops"]["Update"])
    .eq("id", shopId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function GET() {
  try {
    const stripe = createStripeClient(mustEnv("STRIPE_SECRET_KEY"));
    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageBilling",
      allowRoles: ["owner", "admin"],
    });
    if (!access.ok) return access.response;

    const { data: shop, error: shopError } = await access.supabase
      .from("shops")
      .select(
        "id, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_current_period_end, stripe_trial_end",
      )
      .eq("id", access.profile.shop_id)
      .maybeSingle<ShopStripeScope>();

    if (shopError) {
      return NextResponse.json({ error: shopError.message }, { status: 500 });
    }

    if (!shop) {
      return NextResponse.json({ error: "Shop not found." }, { status: 404 });
    }

    const resolution = await findCanonicalSubscription(stripe, shop);

    if (resolution.state === "resolved") {
      await syncShopSubscription(access.supabase, shop.id, resolution.subscription);
      return NextResponse.json(normalizeSubscription(resolution.subscription));
    }

    if (resolution.state === "ambiguous_customer_subscriptions") {
      return NextResponse.json({
        ...normalizeShopFallback(shop),
        linkage_needed: true,
        linkage_state: "ambiguous_customer_subscriptions",
        linked_customer_id: String(shop.stripe_customer_id ?? "").trim() || null,
        linked_subscription_id: null,
        linked_checkout_session_id: null,
        managed_subscription_ids: resolution.subscriptionIds,
      } satisfies NormalizedSubscriptionPayload);
    }

    if (resolution.state === "no_subscription_found") {
      const unlinked = await findUnlinkedSubscriptionEvidence({
        stripe,
        supabase: access.supabase,
        userId: access.profile.id,
        shop,
      });

      if (unlinked) {
        return NextResponse.json({
          ...normalizeShopFallback(shop),
          linkage_needed: true,
          linkage_state: "unlinked_subscription",
          linked_customer_id: unlinked.customerId,
          linked_subscription_id: unlinked.subscriptionId,
          linked_checkout_session_id: unlinked.checkoutSessionId,
        } satisfies NormalizedSubscriptionPayload);
      }

      return NextResponse.json({
        ...normalizeShopFallback(shop),
        linkage_needed: true,
        linkage_state: "no_subscription_found",
        linked_customer_id: String(shop.stripe_customer_id ?? "").trim() || null,
        linked_subscription_id: null,
        linked_checkout_session_id: null,
      } satisfies NormalizedSubscriptionPayload);
    }

    return NextResponse.json(normalizeShopFallback(shop));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve subscription.";
    console.error("[stripe/subscription:get] error", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const stripe = createStripeClient(mustEnv("STRIPE_SECRET_KEY"));
    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageBilling",
      allowRoles: ["owner", "admin"],
      requireOwnerPin: true,
      ownerPinRequest: req,
      ownerPinAllowedPurposes: [OWNER_PIN_PURPOSES.BILLING, OWNER_PIN_PURPOSES.PRIVILEGED],
    });
    if (!access.ok) return access.response;

    const { data: shop, error: shopError } = await access.supabase
      .from("shops")
      .select(
        "id, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_current_period_end, stripe_trial_end",
      )
      .eq("id", access.profile.shop_id)
      .maybeSingle<ShopStripeScope>();

    if (shopError) {
      return NextResponse.json({ error: shopError.message }, { status: 500 });
    }

    if (!shop) {
      return NextResponse.json({ error: "Shop not found." }, { status: 404 });
    }

    const resolution = await findCanonicalSubscription(stripe, shop);

    if (resolution.state !== "resolved") {
      const unlinked = await findUnlinkedSubscriptionEvidence({
        stripe,
        supabase: access.supabase,
        userId: access.profile.id,
        shop,
      });

      if (unlinked) {
        return NextResponse.json(
          {
            error: "Billing linkage is required before managing this subscription.",
            ...normalizeShopFallback(shop),
            linkage_needed: true,
            linkage_state: "unlinked_subscription",
            linked_customer_id: unlinked.customerId,
            linked_subscription_id: unlinked.subscriptionId,
            linked_checkout_session_id: unlinked.checkoutSessionId,
          },
          { status: 409 },
        );
      }

      if (resolution.state === "ambiguous_customer_subscriptions") {
        return NextResponse.json(
          {
            error: "Multiple current managed subscriptions were found for this customer.",
            ...normalizeShopFallback(shop),
            linkage_needed: true,
            linkage_state: "ambiguous_customer_subscriptions",
            linked_customer_id: String(shop.stripe_customer_id ?? "").trim() || null,
            linked_subscription_id: null,
            linked_checkout_session_id: null,
            managed_subscription_ids: resolution.subscriptionIds,
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          error: "No active or trialing subscription was found for this shop.",
          ...normalizeShopFallback(shop),
          linkage_needed: true,
          linkage_state: "no_subscription_found",
          linked_customer_id: String(shop.stripe_customer_id ?? "").trim() || null,
          linked_subscription_id: null,
          linked_checkout_session_id: null,
        },
        { status: 409 },
      );
    }

    const canonicalSubscription = resolution.subscription;

    if (canonicalSubscription.status !== "active" && canonicalSubscription.status !== "trialing") {
      return NextResponse.json(
        {
          error: "Only active or trialing subscriptions can be scheduled for cancellation.",
          ...normalizeSubscription(canonicalSubscription),
        },
        { status: 409 },
      );
    }

    if (canonicalSubscription.cancel_at_period_end) {
      await syncShopSubscription(access.supabase, shop.id, canonicalSubscription);
      return NextResponse.json(normalizeSubscription(canonicalSubscription));
    }

    const updated = await stripe.subscriptions.update(canonicalSubscription.id, {
      cancel_at_period_end: true,
    });

    await syncShopSubscription(access.supabase, shop.id, updated);

    return NextResponse.json(normalizeSubscription(updated));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to schedule cancellation.";
    console.error("[stripe/subscription:cancel] error", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
