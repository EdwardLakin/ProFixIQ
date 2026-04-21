export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { OWNER_PIN_PURPOSES } from "@/features/shared/lib/server/owner-pin";

type DB = Database;

type CheckoutPayload = {
  source?: string;
  planKey?: string;
  priceId?: string;
  shopId?: string | null;
  successPath?: string;
  cancelPath?: string;
  enableTrial?: boolean;
  trialDays?: number;
  applyFoundingDiscount?: boolean;
};

type ShopScope = Pick<
  DB["public"]["Tables"]["shops"]["Row"],
  "id" | "email" | "shop_name" | "name" | "stripe_customer_id"
>;

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL?.trim()) {
    return process.env.NEXT_PUBLIC_SITE_URL.trim().replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL?.trim()) {
    return `https://${process.env.VERCEL_URL.trim().replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}

function getShopDisplayName(shop: { shop_name?: string | null; name?: string | null }): string {
  return (shop.shop_name ?? shop.name ?? "").trim() || "ProFixIQ Shop";
}

function clampTrialDays(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? Math.trunc(value) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  if (n < 1) return 1;
  if (n > 60) return 60;
  return n;
}

function envTrialDays(): number {
  const raw = String(process.env.STRIPE_TRIAL_DAYS ?? "").trim();
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 14;
  return clampTrialDays(n, 14);
}

async function resolvePriceId(stripe: Stripe, input: string): Promise<string | null> {
  const value = input.trim();

  if (value.startsWith("price_")) return value;

  const prices = await stripe.prices.list({
    lookup_keys: [value],
    active: true,
    limit: 1,
  });

  return prices.data?.[0]?.id ?? null;
}

async function createCustomerIfMissing(
  stripe: Stripe,
  supabase: SupabaseClient<DB>,
  shop: ShopScope,
): Promise<string> {
  const existing = (shop.stripe_customer_id ?? "").trim();
  if (existing) return existing;

  const customer = await stripe.customers.create({
    email: shop.email ?? undefined,
    name: getShopDisplayName(shop),
    metadata: {
      shop_id: shop.id,
      source: "profixiq",
    },
  });

  const { error } = await supabase
    .from("shops")
    .update({
      stripe_customer_id: customer.id,
    } as DB["public"]["Tables"]["shops"]["Update"])
    .eq("id", shop.id);

  if (error) {
    throw new Error(error.message);
  }

  return customer.id;
}

export async function POST(req: Request) {
  try {
    const stripe = createStripeClient(mustEnv("STRIPE_SECRET_KEY"));
    const body = (await req.json().catch(() => null)) as CheckoutPayload | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const onboardingHandoffSource = String(body.source ?? "").trim() === "onboarding_shop_boost";

    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageBilling",
      allowRoles: ["owner", "admin"],
      requireOwnerPin: !onboardingHandoffSource,
      ownerPinRequest: req,
      ownerPinAllowedPurposes: [OWNER_PIN_PURPOSES.BILLING, OWNER_PIN_PURPOSES.PRIVILEGED],
    });
    if (!access.ok) return access.response;

    const requestedShopId = String(body.shopId ?? access.profile.shop_id).trim();
    if (!requestedShopId || requestedShopId !== access.profile.shop_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rawPrice = String(body.priceId ?? body.planKey ?? "").trim();
    if (!rawPrice) {
      return NextResponse.json({ error: "Missing price identifier" }, { status: 400 });
    }

    const priceId = await resolvePriceId(stripe, rawPrice);
    if (!priceId) {
      return NextResponse.json(
        { error: `No active Stripe price found for "${rawPrice}"` },
        { status: 400 },
      );
    }

    const { data: shop, error: shopError } = await access.supabase
      .from("shops")
      .select("id, email, shop_name, name, stripe_customer_id")
      .eq("id", requestedShopId)
      .maybeSingle<ShopScope>();

    if (shopError) {
      return NextResponse.json({ error: shopError.message }, { status: 500 });
    }

    if (!shop) {
      return NextResponse.json({ error: "Shop not found." }, { status: 404 });
    }

    const customerId = await createCustomerIfMissing(stripe, access.supabase, shop);

    const baseUrl = getBaseUrl();
    const successUrl = `${baseUrl}${
      body.successPath?.startsWith("/")
        ? body.successPath
        : "/dashboard/owner/settings#billing"
    }?session_id={CHECKOUT_SESSION_ID}`;

    const cancelUrl = `${baseUrl}${
      body.cancelPath?.startsWith("/")
        ? body.cancelPath
        : "/dashboard/owner/settings#billing"
    }`;

    const enableTrial = body.enableTrial !== false;
    const trialDays = clampTrialDays(body.trialDays, envTrialDays());

    const couponId = String(process.env.STRIPE_FOUNDING_COUPON_ID ?? "").trim();
    const applyFoundingDiscount =
      Boolean(couponId) && body.applyFoundingDiscount !== false;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      ...(applyFoundingDiscount ? { discounts: [{ coupon: couponId }] } : {}),
      subscription_data: {
        ...(enableTrial ? { trial_period_days: trialDays } : {}),
        metadata: {
          shop_id: shop.id,
          supabase_user_id: access.profile.id,
          purpose: "profixiq_subscription",
          founding_discount_applied: applyFoundingDiscount ? "true" : "false",
          trial_enabled: enableTrial ? "true" : "false",
          trial_days: enableTrial ? String(trialDays) : "0",
        },
      },
      metadata: {
        shop_id: shop.id,
        supabase_user_id: access.profile.id,
        purpose: "profixiq_subscription",
      },
      customer_update: {
        address: "auto",
        name: "auto",
      },
    });

    return NextResponse.json({ ok: true, sessionId: session.id, url: session.url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create Stripe checkout session.";

    console.error("[stripe/checkout] error", error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
