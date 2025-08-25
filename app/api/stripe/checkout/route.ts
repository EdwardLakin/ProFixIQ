// app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
});

export async function POST(req: Request) {
  const { planKey, interval, isAddon, shopId, userId } = await req.json();

  if (!planKey || typeof planKey !== "string" || !planKey.startsWith("price_")) {
    return NextResponse.json({ error: "Invalid or missing planKey" }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://profixiq.com/";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: planKey, quantity: 1 }],
    success_url: `${baseUrl}/signup?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/subscribe`,
    allow_promotion_codes: true,
    metadata: {
      plan_key: planKey,
      interval,
      is_addon: isAddon ? "true" : "false",
      ...(shopId ? { shop_id: shopId } : {}),
      ...(userId ? { supabaseUserId: userId } : {}),
    },
  });

  return NextResponse.json({ url: session.url, id: session.id });
}