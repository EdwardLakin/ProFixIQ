import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { reconcileShopBillingFromUser } from "@/features/stripe/lib/server/canonical-shop-billing";

type DB = Database;

function toStripeId(v: unknown, prefix: string): string | null {
  if (typeof v === "string" && v.startsWith(prefix)) return v;
  if (v && typeof v === "object") {
    const maybeId = (v as { id?: unknown }).id;
    if (typeof maybeId === "string" && maybeId.startsWith(prefix)) return maybeId;
  }
  return null;
}

export async function handleStripeCheckoutLinkUser(req: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY?.trim()) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
    }

    const supabase = createServerSupabaseRoute();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as { sessionId?: string } | null;
    const sessionId = String(body?.sessionId ?? "").trim();

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const stripe = createStripeClient(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    const customerId = toStripeId(session.customer, "cus_");
    const subscriptionId = toStripeId(session.subscription, "sub_");

    if (!customerId && !subscriptionId) {
      return NextResponse.json(
        { error: "No Stripe billing artifacts found in checkout session" },
        { status: 404 },
      );
    }

    if (customerId) {
      await stripe.customers.update(customerId, {
        metadata: {
          supabase_user_id: user.id,
          supabaseUserId: user.id,
          source: "profixiq",
        },
      });
    }

    if (subscriptionId) {
      const currentSub =
        typeof session.subscription === "object" && session.subscription
          ? session.subscription
          : await stripe.subscriptions.retrieve(subscriptionId);

      await stripe.subscriptions.update(subscriptionId, {
        metadata: {
          ...(currentSub.metadata ?? {}),
          supabase_user_id: user.id,
          source: "profixiq",
        },
      });
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        stripe_checkout_complete: true,
        stripe_checkout_session_id: sessionId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
      } as unknown as DB["public"]["Tables"]["profiles"]["Update"])
      .eq("id", user.id);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .maybeSingle<{ shop_id: string | null }>();

    if (profile?.shop_id) {
      await reconcileShopBillingFromUser({
        stripe,
        supabase,
        userId: user.id,
        shopId: profile.shop_id,
      });
    }

    return NextResponse.json({
      success: true,
      customerId,
      subscriptionId,
      shopLinked: Boolean(profile?.shop_id),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe/checkout/link-user] error", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handleStripeCheckoutLinkUser(req);
}
