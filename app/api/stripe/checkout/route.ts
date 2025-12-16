// app/api/stripe/checkout/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";

/* ------------------------------------------------------------------ */
/* 🔍 ENV + STRIPE DIAGNOSTICS (SAFE)                                  */
/* ------------------------------------------------------------------ */

function safePrefix(v: string | undefined | null) {
  if (!v) return null;
  return v.slice(0, 3); // "sk_" / "pk_" / "whs" etc.
}

function safeLen(v: string | undefined | null) {
  return v ? v.length : 0;
}

function getStripeEnvInventory() {
  const keys = Object.keys(process.env).filter((k) =>
    k.toUpperCase().includes("STRIPE"),
  );

  // prefixes only (no secrets)
  const prefixes: Record<string, string | null> = {};
  const lengths: Record<string, number> = {};

  for (const k of keys) {
    const v = process.env[k];
    prefixes[k] = safePrefix(v);
    lengths[k] = safeLen(v);
  }

  return { keys, prefixes, lengths };
}

console.log("[stripe checkout] boot", {
  // Which deployment/project is actually running this code:
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_URL: process.env.VERCEL_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
  VERCEL_GIT_PROVIDER: process.env.VERCEL_GIT_PROVIDER,
  VERCEL_GIT_REPO_OWNER: process.env.VERCEL_GIT_REPO_OWNER,
  VERCEL_GIT_REPO_SLUG: process.env.VERCEL_GIT_REPO_SLUG,
  VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
  VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
  NODE_ENV: process.env.NODE_ENV,

  // What our server thinks STRIPE_SECRET_KEY looks like:
  STRIPE_SECRET_KEY_present: Boolean(process.env.STRIPE_SECRET_KEY),
  STRIPE_SECRET_KEY_prefix: safePrefix(process.env.STRIPE_SECRET_KEY),
  STRIPE_SECRET_KEY_length: safeLen(process.env.STRIPE_SECRET_KEY),

  // Stripe env inventory (names + prefixes only)
  stripeEnv: getStripeEnvInventory(),
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
  const reqId =
    (globalThis.crypto?.randomUUID?.() as string | undefined) ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    console.log("[stripe checkout] POST hit", {
      reqId,
      method: "POST",
      url: req.url,
      vercelEnv: process.env.VERCEL_ENV,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
      secretPrefix: safePrefix(process.env.STRIPE_SECRET_KEY),
      secretLength: safeLen(process.env.STRIPE_SECRET_KEY),
    });

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error("[stripe checkout] STRIPE_SECRET_KEY missing", { reqId });
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY" },
        { status: 500 },
      );
    }

    const body = (await req.json().catch(() => null)) as CheckoutPayload | null;
    if (!body) {
      console.error("[stripe checkout] invalid JSON body", { reqId });
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const priceId = String(body.planKey ?? body.priceId ?? "").trim();

    console.log("[stripe checkout] payload", {
      reqId,
      priceId,
      pricePrefix: priceId.slice(0, 6), // "price_"
      hasShopId: Boolean(body.shopId),
      hasUserId: Boolean(body.userId),
    });

    if (!priceId || !priceId.startsWith("price_")) {
      console.error("[stripe checkout] invalid priceId", { reqId, priceId });
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
      reqId,
      base,
      successUrl,
      cancelUrl,
      keyPrefix: safePrefix(process.env.STRIPE_SECRET_KEY), // the smoking gun
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
      reqId,
      sessionId: session.id,
      hasUrl: Boolean(session.url),
    });

    if (!session.url) {
      console.error("[stripe checkout] session.url missing", { reqId });
      return NextResponse.json(
        { error: "Stripe did not return a Checkout URL" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe checkout] exception", { reqId, message });
    return NextResponse.json(
      { error: "Checkout failed", details: message },
      { status: 500 },
    );
  }
}