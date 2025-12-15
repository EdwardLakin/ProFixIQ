// app/api/stripe/checkout/route.ts

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";

/* ------------------------------------------------------------------ */
/* 🔍 ENV + STRIPE DIAGNOSTICS (SAFE)                                  */
/* ------------------------------------------------------------------ */
console.log("[stripe checkout] env check", {
  hasKey: Boolean(process.env.STRIPE_SECRET_KEY),
  keyPrefix: process.env.STRIPE_SECRET_KEY?.slice(0, 3), // sk_ vs pk_
  keyLength: process.env.STRIPE_SECRET_KEY?.length,
  vercelEnv: process.env.VERCEL_ENV,
  nodeEnv: process.env.NODE_ENV,
});

/* ------------------------------------------------------------------ */

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
  planKey?: string;
  priceId?: string;
  shopId?: string | null;
  userId?: string | null;
  successPath?: string;
  cancelPath?: string;
};

export async function POST(req: Request) {
  try {
    console.log("[stripe checkout] POST hit");

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error("[stripe checkout] STRIPE_SECRET_KEY missing");
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY" },
        { status: 500 },
      );
    }

    const body = (await req.json().catch(() => null)) as CheckoutPayload | null;
    if (!body) {
      console.error("[stripe checkout] invalid JSON body");
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const priceId = String(body.planKey ?? body.priceId ?? "").trim();

    console.log("[stripe checkout] payload", {
      priceId,
      shopId: body.shopId,
      userId: body.userId,
    });

    if (!priceId || !priceId.startsWith("price_")) {
      console.error("[stripe checkout] invalid priceId", priceId);
      return NextResponse.json(
        { error: "Missing/invalid priceId (expected Stripe price_*)" },
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

    console.log("[stripe checkout] creating session", {
      mode: "subscription",
      successUrl,
      cancelUrl,
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        shop_id: body.shopId ?? "",
        supabaseUserId: body.userId ?? "",
        purpose: "profixiq_subscription",
      },
    });

    console.log("[stripe checkout] session created", {
      sessionId: session.id,
      hasUrl: Boolean(session.url),
    });

    if (!session.url) {
      console.error("[stripe checkout] session.url missing");
      return NextResponse.json(
        { error: "Stripe did not return a Checkout URL" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe checkout] exception", message);
    return NextResponse.json(
      { error: "Checkout failed", details: message },
      { status: 500 },
    );
  }
}