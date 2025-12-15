// app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

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
  // Support both shapes (old + new callers)
  planKey?: string; // price_*
  priceId?: string; // price_*

  // optional at pre-signup time
  shopId?: string | null;
  userId?: string | null;

  // optional redirect overrides
  successPath?: string; // default /signup?session_id=...
  cancelPath?: string;  // default /subscribe
};

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

    const priceId = String(body.planKey ?? body.priceId ?? "").trim();

    if (!priceId || !priceId.startsWith("price_")) {
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

    const shopId = body.shopId ? String(body.shopId).trim() : "";
    const userId = body.userId ? String(body.userId).trim() : "";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        shop_id: shopId,
        supabaseUserId: userId,
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