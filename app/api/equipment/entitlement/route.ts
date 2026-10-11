export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { resolveEquipmentAddonEntitlement } from "@/features/equipment/server/equipmentAddonEntitlement";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing required env: ${name}`);
  return value;
}

export async function GET() {
  try {
    const access = await requireShopScopedApiAccess();
    if (!access.ok) return access.response;

    const { data: shop, error: shopError } = await access.supabase
      .from("shops")
      .select("id,stripe_customer_id,stripe_subscription_id")
      .eq("id", access.profile.shop_id)
      .maybeSingle();

    if (shopError) {
      return NextResponse.json({ error: shopError.message }, { status: 500 });
    }

    if (!shop?.stripe_subscription_id) {
      return NextResponse.json(
        { enabled: false, hasAddonItem: false, packageKey: null, subscriptionStatus: null },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const stripe = createStripeClient(mustEnv("STRIPE_SECRET_KEY"));
    const subscription = await stripe.subscriptions.retrieve(
      shop.stripe_subscription_id,
    );

    const subscriptionCustomerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id ?? null;
    const canonicalCustomerId = String(shop.stripe_customer_id ?? "").trim();
    const metadataShopId = String(subscription.metadata?.shop_id ?? "").trim();

    if (
      (canonicalCustomerId && subscriptionCustomerId !== canonicalCustomerId) ||
      (metadataShopId && metadataShopId !== shop.id)
    ) {
      console.error("[equipment/entitlement] canonical Stripe linkage mismatch", {
        shopId: shop.id,
        subscriptionId: subscription.id,
      });
      return NextResponse.json(
        { error: "Equipment entitlement could not be verified." },
        { status: 409 },
      );
    }

    return NextResponse.json(resolveEquipmentAddonEntitlement(subscription), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[equipment/entitlement] error", error);
    return NextResponse.json(
      { error: "Equipment entitlement could not be verified." },
      { status: 503 },
    );
  }
}
