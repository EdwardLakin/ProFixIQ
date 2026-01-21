// features/stripe/api/stripe/checkout/webhook/route.ts

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
});

const supabase = createClient<DB>(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);

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
  // RFC4122-ish check
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

function toStripeId(
  v: unknown,
  prefix: string,
): string | null {
  // string id
  if (typeof v === "string" && v.startsWith(prefix)) return v;

  // object with id
  if (v && typeof v === "object") {
    const maybeId = (v as { id?: unknown }).id;
    if (typeof maybeId === "string" && maybeId.startsWith(prefix)) return maybeId;
  }

  return null;
}

function unixToIsoOrNull(v: number | null | undefined): string | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return new Date(v * 1000).toISOString();
}

async function syncShopConnectFlagsByAccountId(accountId: string): Promise<void> {
  const acct = await stripe.accounts.retrieve(accountId);
  if (!acct) return;

  const chargesEnabled = Boolean(acct.charges_enabled);
  const payoutsEnabled = Boolean(acct.payouts_enabled);
  const detailsSubmitted = Boolean(acct.details_submitted);

  const { data: shops, error: sErr } = await supabase
    .from("shops")
    .select("id, stripe_account_id")
    .eq("stripe_account_id", accountId);

  if (sErr || !shops || shops.length === 0) return;

  const shopId = shops[0]?.id;
  if (!shopId) return;

  const { error: updErr } = await supabase
    .from("shops")
    .update({
      stripe_charges_enabled: chargesEnabled,
      stripe_payouts_enabled: payoutsEnabled,
      stripe_details_submitted: detailsSubmitted,
      stripe_onboarding_completed:
        chargesEnabled && payoutsEnabled && detailsSubmitted,
    } as DB["public"]["Tables"]["shops"]["Update"])
    .eq("id", shopId);

  if (updErr) console.error("❌ Failed to sync shop connect flags:", updErr.message);
}

type StripeSubStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

async function syncShopBillingFromSubscription(params: {
  shopId: string;
  customerId: string | null;
  subscriptionId: string;
}): Promise<void> {
  const { shopId, customerId, subscriptionId } = params;

  const sub = await stripe.subscriptions.retrieve(subscriptionId);

  const status = String(sub.status ?? "") as StripeSubStatus;
  const trialEndIso = unixToIsoOrNull(sub.trial_end ?? null);
  const periodEndIso = unixToIsoOrNull(sub.current_period_end ?? null);

  const { error } = await supabase
    .from("shops")
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_subscription_status: status,
      stripe_trial_end: trialEndIso,
      stripe_current_period_end: periodEndIso,
    } as unknown as DB["public"]["Tables"]["shops"]["Update"])
    .eq("id", shopId);

  if (error) console.error("❌ Failed to sync shop subscription status:", error.message);
}

export async function POST(req: Request) {
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

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("❌ Stripe webhook verification failed:", message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "account.updated": {
        const acct = event.data.object as Stripe.Account;
        if (isNonEmptyString(acct.id)) await syncShopConnectFlagsByAccountId(acct.id);
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // SUBSCRIPTIONS (Shop billing)
        if (session.mode === "subscription") {
          const userId = session.metadata?.supabaseUserId ?? null;
          const shopIdRaw = session.metadata?.shop_id ?? null;

          const stripeCustomerId = toStripeId(session.customer, "cus_");
          const stripeSubscriptionId = toStripeId(session.subscription, "sub_");
          const checkoutSessionId = session.id;

          // profile update (safe even if shop id is marketing)
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

            if (error) console.error("❌ Failed to update profile:", error.message);
          }

          // only update shops if the shop id is a real UUID
          if (isUuid(shopIdRaw)) {
            const shopId = shopIdRaw;

            const { error } = await supabase
              .from("shops")
              .update({
                stripe_customer_id: stripeCustomerId,
                stripe_subscription_id: stripeSubscriptionId,
                stripe_checkout_session_id: checkoutSessionId,
              } as unknown as DB["public"]["Tables"]["shops"]["Update"])
              .eq("id", shopId);

            if (error) console.error("❌ Failed to update shop billing ids:", error.message);

            if (stripeSubscriptionId) {
              await syncShopBillingFromSubscription({
                shopId,
                customerId: stripeCustomerId,
                subscriptionId: stripeSubscriptionId,
              });
            }
          }

          break;
        }

        // CUSTOMER PAYMENTS (One-time)
        if (session.mode === "payment") {
          const shopId = session.metadata?.shop_id ?? null;
          const workOrderId = session.metadata?.work_order_id ?? null;

          const amountTotal =
            typeof session.amount_total === "number" ? session.amount_total : null;

          const currency = clampCurrency(session.currency);
          const stripeSessionId = session.id;

          const paymentIntentId =
            typeof session.payment_intent === "string" ? session.payment_intent : null;

          if (!shopId || !isNonEmptyString(shopId)) {
            console.warn("⚠️ payment session missing shop_id metadata", { sessionId: stripeSessionId });
            break;
          }

          const insertAmount = amountTotal ?? 0;
          const insertCurrency = currency ?? "usd";

          const { error: payErr } = await supabase.from("payments").insert({
            shop_id: shopId,
            work_order_id: workOrderId && isNonEmptyString(workOrderId) ? workOrderId : null,
            stripe_session_id: stripeSessionId,
            stripe_payment_intent_id: paymentIntentId,
            amount_cents: insertAmount,
            currency: insertCurrency,
            status: "succeeded",
            paid_at: new Date().toISOString(),
            metadata: {
              purpose: session.metadata?.purpose ?? "customer_payment",
              platform_fee_bps: session.metadata?.platform_fee_bps ?? null,
            },
          } as unknown as DB["public"]["Tables"]["payments"]["Insert"]);

          if (payErr) {
            const msg = String(payErr.message ?? "").toLowerCase();
            const isDup =
              msg.includes("duplicate") || msg.includes("unique") || msg.includes("stripe_session_id");
            if (!isDup) console.error("❌ Failed to insert payment:", payErr.message);
          }

          break;
        }

        break;
      }

      // keep shop status correct after trial ends / payment fails / cancel
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        const subscriptionId = String(sub.id ?? "");
        const customerId = toStripeId(sub.customer, "cus_");

        if (!isNonEmptyString(subscriptionId)) break;

        // find shop by subscription id (preferred) or customer id (fallback)
        const filters = [
          `stripe_subscription_id.eq.${subscriptionId}`,
          customerId ? `stripe_customer_id.eq.${customerId}` : "",
        ].filter((x) => x.length > 0);

        const { data: shop, error: sErr } = await supabase
          .from("shops")
          .select("id, stripe_subscription_id, stripe_customer_id")
          .or(filters.join(","))
          .maybeSingle<{ id: string; stripe_subscription_id: string | null; stripe_customer_id: string | null }>();

        if (sErr || !shop?.id) break;

        const status = String(sub.status ?? "") as StripeSubStatus;
        const trialEndIso = unixToIsoOrNull(sub.trial_end ?? null);
        const periodEndIso = unixToIsoOrNull(sub.current_period_end ?? null);

        const { error: updErr } = await supabase
          .from("shops")
          .update({
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: customerId ?? shop.stripe_customer_id ?? null,
            stripe_subscription_status: status,
            stripe_trial_end: trialEndIso,
            stripe_current_period_end: periodEndIso,
          } as unknown as DB["public"]["Tables"]["shops"]["Update"])
          .eq("id", shop.id);

        if (updErr) console.error("❌ Failed to update shop subscription status:", updErr.message);

        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("❌ Webhook processing error:", message);
    return NextResponse.json({ error: "Webhook handler failure" }, { status: 500 });
  }
}