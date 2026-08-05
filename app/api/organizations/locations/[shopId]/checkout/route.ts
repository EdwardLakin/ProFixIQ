export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";

import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { OWNER_PIN_PURPOSES } from "@/features/shared/lib/server/owner-pin";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { resolveStripePlanPriceId } from "@/features/stripe/lib/server/stripe-price-contract";

const checkoutSchema = z
  .object({
    planKey: z.enum(["starter", "unlimited"]),
    checkoutAttemptId: z.string().uuid().optional(),
  })
  .strict();

type ShopScope = Pick<
  Database["public"]["Tables"]["shops"]["Row"],
  | "id"
  | "organization_id"
  | "shop_name"
  | "name"
  | "email"
  | "stripe_customer_id"
  | "stripe_subscription_id"
  | "stripe_subscription_status"
  | "stripe_trial_end"
>;

function mustEnv(name: string): string {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function baseUrl(): string {
  const configured = String(process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercel = String(process.env.VERCEL_URL ?? "").trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

function configuredTrialDays(): number {
  const parsed = Math.trunc(Number(process.env.STRIPE_TRIAL_DAYS ?? "14"));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 60 ? parsed : 14;
}

function displayName(shop: ShopScope): string {
  return String(shop.shop_name ?? shop.name ?? "").trim() || "ProFixIQ Shop";
}

function trialEligible(shop: ShopScope): boolean {
  const status = String(shop.stripe_subscription_status ?? "").trim().toLowerCase();
  return (
    !String(shop.stripe_subscription_id ?? "").trim() &&
    !shop.stripe_trial_end &&
    status !== "active" &&
    status !== "trialing"
  );
}

export async function POST(
  req: Request,
  context: { params: Promise<{ shopId: string }> },
) {
  try {
    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageBilling",
      allowRoles: ["owner", "admin"],
      requireOwnerPin: true,
      ownerPinRequest: req,
      ownerPinAllowedPurposes: [
        OWNER_PIN_PURPOSES.BILLING,
        OWNER_PIN_PURPOSES.PRIVILEGED,
      ],
    });
    if (!access.ok) return access.response;

    const parsed = checkoutSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
    }

    const { shopId } = await context.params;
    const admin = createAdminSupabase();
    const { data: shops, error: shopError } = await admin
      .from("shops")
      .select(
        "id, organization_id, shop_name, name, email, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_trial_end",
      )
      .in("id", [access.profile.shop_id, shopId])
      .returns<ShopScope[]>();

    if (shopError) {
      return NextResponse.json({ error: "Checkout unavailable." }, { status: 503 });
    }

    const currentShop = shops?.find((shop) => shop.id === access.profile.shop_id) ?? null;
    const targetShop = shops?.find((shop) => shop.id === shopId) ?? null;
    if (!currentShop || !targetShop) {
      return NextResponse.json({ error: "Location not found." }, { status: 404 });
    }

    if (
      !currentShop.organization_id ||
      currentShop.organization_id !== targetShop.organization_id
    ) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const stripe = createStripeClient(mustEnv("STRIPE_SECRET_KEY"));
    const priceId = await resolveStripePlanPriceId(stripe, parsed.data.planKey);
    let customerId = String(targetShop.stripe_customer_id ?? "").trim();

    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: targetShop.email ?? undefined,
          name: displayName(targetShop),
          metadata: {
            app: "profixiq",
            shop_id: targetShop.id,
            organization_id: targetShop.organization_id,
            supabase_user_id: access.authUserId,
            source: "organization_location_checkout",
          },
        },
        { idempotencyKey: `profixiq:shop-customer:${targetShop.id}` },
      );
      customerId = customer.id;
      const { error: persistError } = await admin
        .from("shops")
        .update({ stripe_customer_id: customerId })
        .eq("id", targetShop.id);
      if (persistError) throw new Error(persistError.message);
    }

    const trialDays = trialEligible(targetShop) ? configuredTrialDays() : 0;
    const attemptId = parsed.data.checkoutAttemptId ?? randomUUID();
    const metadata: Stripe.MetadataParam = {
      app: "profixiq",
      purpose: "profixiq_subscription",
      source: "organization_location_checkout",
      shop_id: targetShop.id,
      organization_id: targetShop.organization_id,
      supabase_user_id: access.authUserId,
      plan_key: parsed.data.planKey,
      price_id: priceId,
      pricing_model: "base_plus_seats_v2",
      trial_enabled: trialDays > 0 ? "true" : "false",
      trial_days: String(trialDays),
    };

    const returnUrl = `${baseUrl()}/dashboard/owner/settings?location=${encodeURIComponent(
      targetShop.id,
    )}#settings-billing`;
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: returnUrl,
        cancel_url: returnUrl,
        allow_promotion_codes: true,
        subscription_data: {
          ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
          metadata,
        },
        metadata,
      },
      { idempotencyKey: `profixiq:location-checkout:${targetShop.id}:${attemptId}` },
    );

    return NextResponse.json({
      ok: true,
      shopId: targetShop.id,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error("organization_location_checkout_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Checkout unavailable." }, { status: 503 });
  }
}
