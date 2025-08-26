// app/api/stripe/checkout/route.ts
import { NextResponse, NextRequest } from "next/server";
import Stripe from "stripe";

/**
 * We always build absolute URLs from a single source of truth.
 * - In prod: set NEXT_PUBLIC_SITE_URL=https://profixiq.com (no trailing slash)
 * - In preview: Vercel sets VERCEL_URL (e.g. my-app-git-feat-branch.vercel.app)
 * - In local: fall back to http://localhost:3000
 */
function getBaseUrl(req: NextRequest) {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (envUrl) return envUrl;

  const vercel = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (vercel) return `https://${vercel}`;

  // last resort: infer from request host (works locally)
  const host = req.headers.get("host");
  if (host) {
    const proto = host.includes("localhost") ? "http" : "https";
    return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10" as any,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { planKey, interval, isAddon, shopId, userId } = body as {
      planKey?: string;            // MUST be a Stripe price_*
      interval?: "monthly" | "yearly";
      isAddon?: boolean;
      shopId?: string | null;
      userId?: string | null;
    };

    // hard validation – avoid creating sessions with bad price IDs
    if (!planKey || typeof planKey !== "string" || !planKey.startsWith("price_")) {
      return NextResponse.json({ error: "Invalid or missing planKey" }, { status: 400 });
    }

    const baseUrl = getBaseUrl(req);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: planKey, quantity: 1 }],
      // After Stripe checkout we land on Sign Up. User will create an account, receive magic link,
      // then go to /onboarding. (You can swap to /thank-you if you prefer.)
      success_url: `${baseUrl}/signup?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/subscribe`,
      metadata: {
        plan_key: planKey,
        interval: interval ?? "monthly",
        is_addon: isAddon ? "true" : "false",
        ...(shopId ? { shop_id: shopId } : {}),
        ...(userId ? { supabaseUserId: userId } : {}),
      },
    });

    // Return only the URL we need on the client
    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error("Stripe checkout error:", err?.message ?? err);
    return NextResponse.json({ error: "Checkout creation failed" }, { status: 500 });
  }
}