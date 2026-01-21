// app/api/stripe/checkout/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
});

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL)
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

type CheckoutPayload = {
  planKey?: string; // can be lookup key OR price_*
  priceId?: string; // price_*
  shopId?: string | null;
  userId?: string | null;
  successPath?: string;
  cancelPath?: string;

  // Trial + founding controls
  enableTrial?: boolean; // default true
  trialDays?: number; // default env STRIPE_TRIAL_DAYS or 14
  applyFoundingDiscount?: boolean; // default true if coupon exists
};

async function resolvePriceId(input: string): Promise<string | null> {
  const v = input.trim();

  // Direct price id
  if (v.startsWith("price_")) return v;

  // Treat as lookup key
  const res = await stripe.prices.list({
    lookup_keys: [v],
    active: true,
    limit: 1,
  });

  const price = res.data?.[0];
  return price?.id ?? null;
}

function clampTrialDays(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? Math.trunc(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  if (n < 1) return 1;
  if (n > 60) return 60;
  return n;
}

function envTrialDays(): number {
  const raw = String(process.env.STRIPE_TRIAL_DAYS ?? "").trim();
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 14;
  return clampTrialDays(n, 14);
}

export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY" },
        { status: 500 },
      );
    }

    const body = (await req.json().catch(() => null)) as CheckoutPayload | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const raw = String(body.priceId ?? body.planKey ?? "").trim();
    if (!raw) {
      return NextResponse.json(
        { error: "Missing price identifier" },
        { status: 400 },
      );
    }

    const priceId = await resolvePriceId(raw);
    if (!priceId) {
      return NextResponse.json(
        { error: `No active Stripe price found for "${raw}"` },
        { status: 400 },
      );
    }

    const base = getBaseUrl();

    const successUrl = `${base}${
      body.successPath?.startsWith("/")
        ? body.successPath
        : "/signup?session_id={CHECKOUT_SESSION_ID}"
    }`;

    const cancelUrl = `${base}${
      body.cancelPath?.startsWith("/") ? body.cancelPath : "/subscribe"
    }`;

    // Trial defaults ON (14 days)
    const enableTrial = body.enableTrial !== false;
    const trialDays = clampTrialDays(body.trialDays, envTrialDays());

    // Founding discount (coupon id)
    // Prefer env STRIPE_FOUNDING_COUPON_ID; fallback to your provided id.
    const couponId = String(
      process.env.STRIPE_FOUNDING_COUPON_ID ?? "7rhJRj31",
    ).trim();

    const applyFounding =
      Boolean(couponId) && body.applyFoundingDiscount !== false;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        ...(enableTrial ? { trial_period_days: trialDays } : {}),
        ...(applyFounding ? { discounts: [{ coupon: couponId }] } : {}),
        metadata: {
          shop_id: body.shopId ? String(body.shopId).trim() : "",
          supabaseUserId: body.userId ? String(body.userId).trim() : "",
          purpose: "profixiq_subscription",
          founding_discount_applied: applyFounding ? "true" : "false",
          trial_enabled: enableTrial ? "true" : "false",
          trial_days: enableTrial ? String(trialDays) : "0",
        },
      },
      metadata: {
        shop_id: body.shopId ? String(body.shopId).trim() : "",
        supabaseUserId: body.userId ? String(body.userId).trim() : "",
        purpose: "profixiq_subscription",
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a Checkout URL" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe checkout]", message);
    return NextResponse.json(
      { error: "Checkout failed", details: message },
      { status: 500 },
    );
  }
}