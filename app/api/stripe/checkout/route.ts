// app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
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
  planKey: string; // price_*
  shopId: string;
  userId?: string | null;
};

/**
 * ProFixIQ SaaS subscription checkout (shop pays ProFixIQ).
 * NOTE: This should NOT use Connect transfer_data (that’s for customer payments).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CheckoutPayload;
    const { planKey, shopId, userId } = body;

    if (!planKey || !planKey.startsWith("price_")) {
      return NextResponse.json({ error: "Invalid planKey" }, { status: 400 });
    }
    if (!shopId) {
      return NextResponse.json({ error: "Missing shopId" }, { status: 400 });
    }

    const base = getBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: planKey, quantity: 1 }],
      success_url: `${base}/signup?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/subscribe`,
      metadata: {
        shop_id: shopId,
        supabaseUserId: userId ?? "",
        purpose: "profixiq_subscription",
      },
    });

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