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
  linkage_state?: "unlinked_subscription";
  linked_customer_id?: string | null;
  linked_subscription_id?: string | null;
};

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

async function findCanonicalSubscription(
  stripe: Stripe,
  shop: ShopStripeScope,
): Promise<Stripe.Subscription | null> {
  const subscriptionId = String(shop.stripe_subscription_id ?? "").trim();
  const customerId = String(shop.stripe_customer_id ?? "").trim();

  if (subscriptionId) {
    const byId = await stripe.subscriptions.retrieve(subscriptionId);
    const subscriptionCustomerId =
      typeof byId.customer === "string" ? byId.customer : String(byId.customer?.id ?? "").trim();
    const metadataShopId = String(byId.metadata?.shop_id ?? "").trim();

    const customerMatches = !customerId || (subscriptionCustomerId && subscriptionCustomerId === customerId);
    const metadataMatches = metadataShopId === "" || metadataShopId === shop.id;

    if (customerMatches && metadataMatches) {
      return byId;
    }
  }

  if (!customerId) return null;

  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });

  if (!Array.isArray(list.data) || list.data.length === 0) {
    return null;
  }

  const preferredStatuses = new Set(["trialing", "active", "past_due", "unpaid", "paused"]);
  const sorted = [...list.data].sort((a, b) => {
    const aPreferred = preferredStatuses.has(String(a.status ?? ""));
    const bPreferred = preferredStatuses.has(String(b.status ?? ""));
    if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
    return (b.created ?? 0) - (a.created ?? 0);
  });

  for (const subscription of sorted) {
    const metadataShopId = String(subscription.metadata?.shop_id ?? "").trim();
    if (!metadataShopId || metadataShopId === shop.id) {
      return subscription;
    }
  }

  return sorted[0] ?? null;
}

async function findUnlinkedSubscriptionEvidence(args: {
  stripe: Stripe;
  supabase: SupabaseClient<DB>;
  userId: string;
  shop: ShopStripeScope;
}): Promise<{ customerId: string | null; subscriptionId: string | null } | null> {
  const { stripe, supabase, userId, shop } = args;
  const profile = await getProfileStripeArtifacts(supabase, userId);
  if (!profile) return null;

  const profileCustomerId = String(profile.stripe_customer_id ?? "").trim() || null;
  const profileSubscriptionId = String(profile.stripe_subscription_id ?? "").trim() || null;

  const canonicalCustomerId = String(shop.stripe_customer_id ?? "").trim() || null;
  const canonicalSubscriptionId = String(shop.stripe_subscription_id ?? "").trim() || null;

  if (!profileCustomerId && !profileSubscriptionId) return null;

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
      return { customerId: profileCustomerId, subscriptionId: latest.id };
    }
    return { customerId: profileCustomerId, subscriptionId: null };
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

    const canonicalSubscription = await findCanonicalSubscription(stripe, shop);

    if (!canonicalSubscription) {
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
        } satisfies NormalizedSubscriptionPayload);
      }

      return NextResponse.json(normalizeShopFallback(shop));
    }

    await syncShopSubscription(access.supabase, shop.id, canonicalSubscription);

    return NextResponse.json(normalizeSubscription(canonicalSubscription));
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

    const canonicalSubscription = await findCanonicalSubscription(stripe, shop);

    if (!canonicalSubscription) {
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
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          error: "No active or trialing subscription was found for this shop.",
        },
        { status: 400 },
      );
    }

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
