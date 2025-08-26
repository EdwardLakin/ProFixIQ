// app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
});

type Interval = "monthly" | "yearly";

interface CheckoutPayload {
  planKey: string;
  interval?: Interval;
  isAddon?: boolean;
  shopId?: string | null;
  userId?: string | null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CheckoutPayload;
    const { planKey, interval = "monthly", isAddon = false, shopId = null, userId = null } = body ?? {};

    if (!planKey || typeof planKey !== "string" || !planKey.startsWith("price_")) {
      return NextResponse.json({ error: "Invalid or missing planKey" }, { status: 400 });
    }

    const successBase = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://profixiq.com";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: planKey, quantity: 1 }],
      success_url: `${successBase}/signup?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${successBase}/subscribe`,
      metadata: {
        plan_key: planKey,
        interval,
        is_addon: isAddon ? "true" : "false",
        ...(shopId ? { shop_id: shopId } : {}),
        ...(userId ? { supabaseUserId: userId } : {}),
      },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Stripe checkout error:", message, err);
    return NextResponse.json({ error: "Checkout creation failed", details: message }, { status: 500 });
  }
}