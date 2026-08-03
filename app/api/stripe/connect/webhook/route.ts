export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { handleStripeWebhook } from "@/features/stripe/api/stripe/webhook/route";

function mustEnv(name: string): string {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function signForInternalDelegation(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

export async function POST(req: Request): Promise<Response> {
  let stripeSecret: string;
  let connectWebhookSecret: string;
  let platformWebhookSecret: string;
  try {
    stripeSecret = mustEnv("STRIPE_SECRET_KEY");
    connectWebhookSecret = mustEnv("STRIPE_CONNECT_WEBHOOK_SECRET");
    platformWebhookSecret = mustEnv("STRIPE_WEBHOOK_SECRET");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Missing Stripe configuration" },
      { status: 500 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  const payload = await req.text();
  const stripe = createStripeClient(stripeSecret);
  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      connectWebhookSecret,
    );
    const connectedAccountId = String(event.account ?? "").trim();
    if (!connectedAccountId.startsWith("acct_")) {
      return NextResponse.json(
        { error: "Connect webhook is missing connected-account identity" },
        { status: 400 },
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  const delegatedHeaders = new Headers(req.headers);
  delegatedHeaders.set(
    "stripe-signature",
    signForInternalDelegation(payload, platformWebhookSecret),
  );
  delegatedHeaders.set("x-profixiq-stripe-source", "connected-account");

  const delegatedRequest = new Request(req.url, {
    method: "POST",
    headers: delegatedHeaders,
    body: payload,
  });

  return handleStripeWebhook(delegatedRequest);
}
