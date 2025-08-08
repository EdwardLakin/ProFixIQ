import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
});

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: Request) {
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  let event: Stripe.Event;

  let rawBody: string;
  let sig: string | null;

  try {
    rawBody = await req.text();
    sig = req.headers.get("stripe-signature");

    console.log("🟡 Received webhook", {
      headers: Object.fromEntries(req.headers),
      body: rawBody.slice(0, 500), // Log first 500 chars
    });

    if (!sig) {
      console.error("❌ Missing Stripe signature header");
      return NextResponse.json(
        { error: "Missing Stripe signature" },
        { status: 400 },
      );
    }

    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
    console.log("🟢 Stripe webhook verified:", event.type);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("❌ Stripe webhook verification failed:", message);
    return NextResponse.json(
      { error: `Webhook Error: ${message}` },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabaseUserId;
        const isAddon = session.metadata?.is_addon === "true";
        const shopId = session.metadata?.shop_id;

        console.log("✅ Checkout session completed:", {
          userId,
          isAddon,
          shopId,
          planKey: session.metadata?.plan_key,
        });

        if (isAddon && shopId) {
          const { data: shop, error: fetchError } = await supabase
            .from("shops")
            .select("user_limit")
            .eq("id", shopId)
            .single();

          if (fetchError || !shop) {
            console.error("❌ Failed to fetch shop:", fetchError?.message);
          } else {
            const newLimit = (shop.user_limit ?? 0) + 5;
            const { error: updateError } = await supabase
              .from("shops")
              .update({ user_limit: newLimit })
              .eq("id", shopId);

            if (updateError) {
              console.error(
                "❌ Failed to update user_limit:",
                updateError.message,
              );
            } else {
              console.log(
                `✅ user_limit updated to ${newLimit} for shop ${shopId}`,
              );
            }
          }
        }

        if (userId) {
          const { error: profileError } = await supabase
            .from("profiles")
            .update({ stripe_checkout_complete: true })
            .eq("id", userId);

          if (profileError) {
            console.error("❌ Failed to update profile:", profileError.message);
          } else {
            console.log(
              `✅ Profile ${userId} marked as stripe_checkout_complete`,
            );
          }
        }

        break;
      }

      default:
        console.warn(`⚠️ Unhandled Stripe event type: ${event.type}`);
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("❌ Webhook processing error:", message);
    return NextResponse.json(
      { error: "Webhook handler failure" },
      { status: 500 },
    );
  }
}
