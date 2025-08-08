import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
});

export async function POST(req: Request) {
  const body = await req.json();
  const { planKey, interval, isAddon, shopId, userId } = body;

  // ✅ VALIDATE that planKey is a valid Stripe price ID
  if (
    !planKey ||
    typeof planKey !== "string" ||
    !planKey.startsWith("price_")
  ) {
    return NextResponse.json(
      { error: "Invalid or missing planKey" },
      { status: 400 },
    );
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "subscription",
    line_items: [
      {
        price: planKey, // ✅ using the actual price ID now
        quantity: 1,
      },
    ],
    success_url: `https://ominous-halibut-r4x7gg57grgjc55qr-3000.app.github.dev/signup?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `https://ominous-halibut-r4x7gg57grgjc55qr-3000.app.github.dev/subscribe`,
    metadata: {
      plan_key: planKey,
      interval,
      is_addon: isAddon ? "true" : "false",
      ...(shopId && { shop_id: shopId }),
      ...(userId && { supabaseUserId: userId }),
    },
  });

  console.log("✅ Stripe Checkout session created:", session.id);
  return NextResponse.json({ url: session.url });
}
