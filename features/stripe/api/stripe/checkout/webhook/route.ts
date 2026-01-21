//features/stripe/api/stripe/checkout/webhook/route.ts

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

function toStripeId(v: unknown, prefix: string): string | null {
  return typeof v === "string" && v.startsWith(prefix) ? v : null;
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

        /* ------------------------------ */
        /* SUBSCRIPTIONS (Shop billing)   */
        /* ------------------------------ */
        if (session.mode === "subscription") {
          const userId = session.metadata?.supabaseUserId ?? null;
          const shopId = session.metadata?.shop_id ?? null;

          const stripeCustomerId = toStripeId(session.customer, "cus_");
          const stripeSubscriptionId = toStripeId(session.subscription, "sub_");
          const checkoutSessionId = session.id;

          // Update profile (if we know who initiated checkout)
          if (isNonEmptyString(userId)) {
            const { error } = await supabase
              .from("profiles")
              .update({
                stripe_checkout_complete: true,
                // add these columns in DB if missing
                stripe_customer_id: stripeCustomerId,
                stripe_subscription_id: stripeSubscriptionId,
                stripe_checkout_session_id: checkoutSessionId,
              } as unknown as DB["public"]["Tables"]["profiles"]["Update"])
              .eq("id", userId);

            if (error) console.error("❌ Failed to update profile:", error.message);
          }

          // Update shop (preferred place to store billing identity)
          if (isNonEmptyString(shopId)) {
            const { error } = await supabase
              .from("shops")
              .update({
                // add these columns in DB if missing
                stripe_customer_id: stripeCustomerId,
                stripe_subscription_id: stripeSubscriptionId,
                stripe_checkout_session_id: checkoutSessionId,
              } as unknown as DB["public"]["Tables"]["shops"]["Update"])
              .eq("id", shopId);

            if (error) console.error("❌ Failed to update shop billing ids:", error.message);
          }

          break;
        }

        /* ------------------------------ */
        /* CUSTOMER PAYMENTS (One-time)   */
        /* ------------------------------ */
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