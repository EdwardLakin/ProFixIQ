import { NextResponse } from "next/server";

import { enforceAuthRateLimit } from "@/features/auth/server/authRateLimit";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { verifyStripeAcquisitionCheckout } from "@/features/stripe/lib/server/stripe-acquisition-intent";

const CHECKOUT_SESSION_PATTERN = /^cs_[A-Za-z0-9_]+$/;

function noStoreJson(body: unknown, status = 200, extraHeaders?: HeadersInit) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

export async function handleStripeAcquisitionContext(req: Request) {
  const sessionId =
    new URL(req.url).searchParams.get("session_id")?.trim() ?? "";
  if (!CHECKOUT_SESSION_PATTERN.test(sessionId)) {
    return noStoreJson({ error: "Invalid checkout session" }, 400);
  }

  const rateLimit = enforceAuthRateLimit(
    req,
    "stripe-acquisition-context",
    sessionId,
    {
      max: 10,
      windowMs: 60_000,
    },
  );
  if (!rateLimit.allowed) {
    return noStoreJson({ error: "Too many requests" }, 429, {
      "Retry-After": String(rateLimit.retryAfterSeconds),
    });
  }

  try {
    const secretKey = String(process.env.STRIPE_SECRET_KEY ?? "").trim();
    if (!secretKey) return noStoreJson({ error: "Billing unavailable" }, 503);

    const stripe = createStripeClient(secretKey);
    const verified = await verifyStripeAcquisitionCheckout(stripe, sessionId);
    if (!verified) {
      return noStoreJson(
        { error: "Checkout is not eligible for account setup" },
        400,
      );
    }

    return noStoreJson({
      email: verified.email,
      surface: verified.metadata.surface,
    });
  } catch (error) {
    console.error("stripe_acquisition_context_failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return noStoreJson({ error: "Checkout verification unavailable" }, 503);
  }
}

export async function GET(req: Request) {
  return handleStripeAcquisitionContext(req);
}
