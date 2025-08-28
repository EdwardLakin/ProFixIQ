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

type Interval = "monthly" | "yearly";
interface CheckoutPayload {
  planKey: string;            // Stripe price_ id
  interval?: Interval;
  isAddon?: boolean;
  shopId?: string | null;
  userId?: string | null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CheckoutPayload;
    const {
      planKey,
      interval = "monthly",
      isAddon = false,
      shopId = null,
      userId = null,
    } = body ?? {};

    if (!planKey || !planKey.startsWith("price_")) {
      return NextResponse.json({ error: "Invalid or missing planKey" }, { status: 400 });
    }

    const base = getBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: planKey, quantity: 1 }],
      // ✅ Send new users straight to Sign Up (not /confirm)
      success_url: `${base}/signup?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/subscribe`,
      client_reference_id: userId ?? undefined, // optional; handy for later
      metadata: {
        plan_key: planKey,
        interval,
        is_addon: isAddon ? "true" : "false",
        ...(shopId ? { shop_id: shopId } : {}),
        ...(userId ? { supabaseUserId: userId } : {}),
      },
    });

    // Optional tiny debug (remove if you want)
    console.log("[stripe] created checkout", { url: session.url, base });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe] checkout error:", message, err);
    return NextResponse.json(
      { error: "Checkout creation failed", details: message },
      { status: 500 }
    );
  }
}