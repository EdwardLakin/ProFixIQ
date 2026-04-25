export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { syncCanonicalShopBilling } from "@/features/stripe/lib/server/canonical-shop-billing";

type DB = Database;

type WebhookContext = {
  event: Stripe.Event;
  stripe: Stripe;
  supabase: ReturnType<typeof createClient<DB>>;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function clampCurrency(v: unknown): "usd" | "cad" | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "usd") return "usd";
  if (s === "cad") return "cad";
  return null;
}

function isUuid(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const s = v.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function toStripeId(v: unknown, prefix: string): string | null {
  if (typeof v === "string" && v.startsWith(prefix)) return v;
  if (v && typeof v === "object") {
    const maybeId = (v as { id?: unknown }).id;
    if (typeof maybeId === "string" && maybeId.startsWith(prefix)) return maybeId;
  }
  return null;
}


async function syncShopConnectFlagsByAccountId(ctx: {
  stripe: Stripe;
  supabase: ReturnType<typeof createClient<DB>>;
  accountId: string;
}): Promise<void> {
  const acct = await ctx.stripe.accounts.retrieve(ctx.accountId);
  if (!acct) return;

  const chargesEnabled = Boolean(acct.charges_enabled);
  const payoutsEnabled = Boolean(acct.payouts_enabled);
  const detailsSubmitted = Boolean(acct.details_submitted);

  const { data: shops, error: sErr } = await ctx.supabase
    .from("shops")
    .select("id, stripe_account_id")
    .eq("stripe_account_id", ctx.accountId);

  if (sErr || !shops || shops.length === 0) return;

  const shopId = shops[0]?.id;
  if (!shopId) return;

  const { error: updErr } = await ctx.supabase
    .from("shops")
    .update({
      stripe_charges_enabled: chargesEnabled,
      stripe_payouts_enabled: payoutsEnabled,
      stripe_details_submitted: detailsSubmitted,
      stripe_onboarding_completed: chargesEnabled && payoutsEnabled && detailsSubmitted,
    } as DB["public"]["Tables"]["shops"]["Update"])
    .eq("id", shopId);

  if (updErr) console.error("[stripe/webhook] Failed to sync connect flags:", updErr.message);
}

async function resolveShopIdForSubscription(params: {
  stripe: Stripe;
  supabase: ReturnType<typeof createClient<DB>>;
  subscription: Stripe.Subscription;
  customerId: string | null;
}): Promise<string | null> {
  const { stripe, supabase, subscription, customerId } = params;

  const metadataShopId = String(subscription.metadata?.shop_id ?? "").trim();
  if (isUuid(metadataShopId)) return metadataShopId;

  if (customerId) {
    const { data: byCustomer, error: customerErr } = await supabase
      .from("shops")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .limit(2);

    if (!customerErr && Array.isArray(byCustomer) && byCustomer.length === 1 && byCustomer[0]?.id) {
      return byCustomer[0].id;
    }

    const customer = await stripe.customers.retrieve(customerId);
    const metadataUserId =
      customer && !("deleted" in customer && customer.deleted)
        ? String(
            customer.metadata?.supabase_user_id ?? customer.metadata?.supabaseUserId ?? "",
          ).trim()
        : "";

    if (isUuid(metadataUserId)) {
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", metadataUserId)
        .maybeSingle<{ shop_id: string | null }>();

      if (!profileErr && isUuid(profile?.shop_id)) {
        return profile.shop_id;
      }
    }
  }

  const metadataUserId = String(subscription.metadata?.supabase_user_id ?? "").trim();
  if (isUuid(metadataUserId)) {
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", metadataUserId)
      .maybeSingle<{ shop_id: string | null }>();

    if (!profileErr && isUuid(profile?.shop_id)) {
      return profile.shop_id;
    }
  }

  return null;
}

async function upsertPaymentFromCheckout(ctx: {
  supabase: ReturnType<typeof createClient<DB>>;
  session: Stripe.Checkout.Session;
}): Promise<void> {
  const { session, supabase } = ctx;

  const shopId = session.metadata?.shop_id ?? null;
  const workOrderId = session.metadata?.work_order_id ?? null;
  const stripeSessionId = session.id;

  if (!shopId || !isNonEmptyString(shopId)) {
    console.warn("[stripe/webhook] payment session missing shop_id metadata", { sessionId: stripeSessionId });
    return;
  }

  const amountTotal = typeof session.amount_total === "number" ? session.amount_total : 0;
  const currency = clampCurrency(session.currency) ?? "usd";
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;

  const { data: existing, error: existingError } = await supabase
    .from("payments")
    .select("id, status")
    .eq("stripe_session_id", stripeSessionId)
    .limit(1)
    .maybeSingle<{ id: string; status: string | null }>();

  if (existingError) {
    console.error("[stripe/webhook] Failed checking existing payment:", existingError.message);
    return;
  }

  const payload = {
    shop_id: shopId,
    work_order_id: workOrderId && isNonEmptyString(workOrderId) ? workOrderId : null,
    stripe_session_id: stripeSessionId,
    stripe_payment_intent_id: paymentIntentId,
    amount_cents: amountTotal,
    currency,
    status: "succeeded",
    paid_at: new Date().toISOString(),
    metadata: {
      purpose: session.metadata?.purpose ?? "customer_payment",
      platform_fee_bps: session.metadata?.platform_fee_bps ?? null,
      webhook_event_id: session.id,
    },
  } as unknown as DB["public"]["Tables"]["payments"]["Insert"];

  if (!existing?.id) {
    const { error: payErr } = await supabase.from("payments").insert(payload);
    if (payErr) {
      const msg = String(payErr.message ?? "").toLowerCase();
      const isDup = msg.includes("duplicate") || msg.includes("unique") || msg.includes("stripe_session_id");
      if (!isDup) console.error("[stripe/webhook] Failed to insert payment:", payErr.message);
    }
    return;
  }

  const { error: updateErr } = await supabase
    .from("payments")
    .update({
      status: "succeeded",
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
    } as DB["public"]["Tables"]["payments"]["Update"])
    .eq("id", existing.id);

  if (updateErr) {
    console.error("[stripe/webhook] Failed to update existing payment:", updateErr.message);
  }
}

async function processStripeWebhookEvent(ctx: WebhookContext): Promise<void> {
  const { event, stripe, supabase } = ctx;

  switch (event.type) {
    case "account.updated": {
      const acct = event.data.object as Stripe.Account;
      if (isNonEmptyString(acct.id)) {
        await syncShopConnectFlagsByAccountId({ stripe, supabase, accountId: acct.id });
      }
      return;
    }

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.mode === "subscription") {
        const userId =
          session.metadata?.supabase_user_id ??
          session.metadata?.supabaseUserId ??
          (isUuid(session.client_reference_id) ? session.client_reference_id : null);
        const shopIdRaw = session.metadata?.shop_id ?? null;

        const stripeCustomerId = toStripeId(session.customer, "cus_");
        const stripeSubscriptionId = toStripeId(session.subscription, "sub_");
        const checkoutSessionId = session.id;

        if (isNonEmptyString(userId)) {
          const { error } = await supabase
            .from("profiles")
            .update({
              stripe_checkout_complete: true,
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: stripeSubscriptionId,
              stripe_checkout_session_id: checkoutSessionId,
            } as unknown as DB["public"]["Tables"]["profiles"]["Update"])
            .eq("id", userId);

          if (error) console.error("[stripe/webhook] Failed to update profile:", error.message);
        }

        let resolvedShopId: string | null = isUuid(shopIdRaw) ? shopIdRaw : null;

        if (!resolvedShopId && stripeSubscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          const subscriptionShopId = String(subscription.metadata?.shop_id ?? "").trim();
          if (isUuid(subscriptionShopId)) {
            resolvedShopId = subscriptionShopId;
          }
        }

        if (!resolvedShopId && isUuid(userId)) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("shop_id")
            .eq("id", userId)
            .maybeSingle<{ shop_id: string | null }>();
          if (isUuid(profile?.shop_id)) resolvedShopId = profile.shop_id;
        }

        if (resolvedShopId) {
          const { error } = await supabase
            .from("shops")
            .update({
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: stripeSubscriptionId,
              stripe_checkout_session_id: checkoutSessionId,
            } as unknown as DB["public"]["Tables"]["shops"]["Update"])
            .eq("id", resolvedShopId);

          if (error) console.error("[stripe/webhook] Failed to update shop billing ids:", error.message);

          if (stripeSubscriptionId) {
            await syncCanonicalShopBilling({
              stripe,
              supabase,
              shopId: resolvedShopId,
              customerId: stripeCustomerId,
              subscriptionId: stripeSubscriptionId,
              checkoutSessionId,
            });
          }
        }

        return;
      }

      if (session.mode === "payment") {
        await upsertPaymentFromCheckout({ supabase, session });
      }
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;

      const subscriptionId = String(sub.id ?? "");
      const customerId = toStripeId(sub.customer, "cus_");

      if (!isNonEmptyString(subscriptionId)) return;
      const resolvedShopId = await resolveShopIdForSubscription({
        stripe,
        supabase,
        subscription: sub,
        customerId,
      });

      if (!resolvedShopId) return;

      try {
        await syncCanonicalShopBilling({
          stripe,
          supabase,
          shopId: resolvedShopId,
          customerId,
          subscriptionId,
        });
      } catch (syncErr) {
        console.error("[stripe/webhook] Failed to sync shop subscription status:", syncErr);
      }
      return;
    }

    default:
      return;
  }
}

export async function handleStripeWebhook(req: Request): Promise<Response> {
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  if (!endpointSecret) {
    return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  const stripe = createStripeClient(process.env.STRIPE_SECRET_KEY);

  const supabase = createClient<DB>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe/webhook] verification failed:", message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  try {
    await processStripeWebhookEvent({ event, stripe, supabase });
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe/webhook] processing error:", message);
    return NextResponse.json({ error: "Webhook handler failure" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handleStripeWebhook(req);
}
