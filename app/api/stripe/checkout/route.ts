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
  supabaseUserId?: string | null;
  successPath?: string;
  cancelPath?: string;
  enableTrial?: boolean;
  trialDays?: number;
  applyFoundingDiscount?: boolean;
  demoId?: string | null;
  intakeId?: string | null;
};

type CanonicalPlanKey = "starter10" | "pro50" | "unlimited";

const PLAN_PRICE_ENV_BY_KEY: Record<CanonicalPlanKey, string> = {
  starter10: "STRIPE_PRICE_STARTER_MONTHLY",
  pro50: "STRIPE_PRICE_PRO_MONTHLY",
  unlimited: "STRIPE_PRICE_UNLIMITED_MONTHLY",
};

const PLAN_ALIASES: Record<string, CanonicalPlanKey> = {
  starter: "starter10",
  starter10: "starter10",
  pro: "pro50",
  pro50: "pro50",
  unlimited: "unlimited",
};

function normalizePlanKey(value: string): CanonicalPlanKey | null {
  return PLAN_ALIASES[value.trim().toLowerCase()] ?? null;
}

function resolveConfiguredPriceIdFromPlan(planKey: CanonicalPlanKey): string {
  const envName = PLAN_PRICE_ENV_BY_KEY[planKey];
  const configured = String(process.env[envName] ?? "").trim();
  if (!configured) {
    throw new Error(`Missing required env: ${envName}`);
  }
  if (!configured.startsWith("price_")) {
    throw new Error(`Invalid Stripe price ID in ${envName}`);
  }
  return configured;
}

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

    const source = String(body.source ?? "").trim();
    const isAcquisitionCheckout = source === "pricing_cta";
    const onboardingHandoffSource = source === "onboarding_shop_boost";

    const rawPlanKey = String(body.planKey ?? "").trim();
    const normalizedPlanKey = normalizePlanKey(rawPlanKey);
    const rawPriceInput = String(body.priceId ?? "").trim();

    if (!rawPriceInput && !normalizedPlanKey && !rawPlanKey) {
      return NextResponse.json({ error: "Missing price identifier" }, { status: 400 });
    }

    let priceId = "";

    if (normalizedPlanKey) {
      priceId = resolveConfiguredPriceIdFromPlan(normalizedPlanKey);
    } else {
      const directOrLookup = rawPriceInput || rawPlanKey;
      const resolvedPriceId = await resolvePriceId(stripe, directOrLookup);
      if (!resolvedPriceId) {
        return NextResponse.json(
          { error: `No active Stripe price found for "${directOrLookup}"` },
          { status: 400 },
        );
      }
      priceId = resolvedPriceId;
    }

    const baseUrl = getBaseUrl();
    const acquisitionSuccessPath = "/auth/callback?flow=acquisition&session_id={CHECKOUT_SESSION_ID}";
    const acquisitionCancelPath = "/compare-plans";
    const successUrl = `${baseUrl}${
      body.successPath?.startsWith("/")
        ? body.successPath
        : isAcquisitionCheckout
          ? acquisitionSuccessPath
          : "/dashboard/owner/settings#billing"
    }`;

    const cancelUrl = `${baseUrl}${
      body.cancelPath?.startsWith("/")
        ? body.cancelPath
        : isAcquisitionCheckout
          ? acquisitionCancelPath
          : "/dashboard/owner/settings#billing"
    }`;

    const enableTrial = body.enableTrial !== false;
    const trialDays = clampTrialDays(body.trialDays, envTrialDays());

    const couponId = String(process.env.STRIPE_FOUNDING_COUPON_ID ?? "").trim();
    const requestedMetadataShopId = String(body.shopId ?? "").trim();
    const requestedMetadataUserId = String(body.supabaseUserId ?? "").trim();

    const applyFoundingDiscount =
      Boolean(couponId) && body.applyFoundingDiscount !== false;

    if (isAcquisitionCheckout) {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        ...(applyFoundingDiscount ? { discounts: [{ coupon: couponId }] } : {}),
        subscription_data: {
          ...(enableTrial ? { trial_period_days: trialDays } : {}),
          metadata: {
            purpose: "profixiq_acquisition",
            source: "pricing_cta",
            founding_discount_applied: applyFoundingDiscount ? "true" : "false",
            trial_enabled: enableTrial ? "true" : "false",
            trial_days: enableTrial ? String(trialDays) : "0",
            demo_id: String(body.demoId ?? "").trim() || "",
            intake_id: String(body.intakeId ?? "").trim() || "",
            shop_id: requestedMetadataShopId || "",
            supabase_user_id: requestedMetadataUserId || "",
          },
        },
        metadata: {
          purpose: "profixiq_acquisition",
          source: "pricing_cta",
          demo_id: String(body.demoId ?? "").trim() || "",
          intake_id: String(body.intakeId ?? "").trim() || "",
          shop_id: requestedMetadataShopId || "",
          supabase_user_id: requestedMetadataUserId || "",
        },
      });

      return NextResponse.json({ ok: true, sessionId: session.id, url: session.url });
    }

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
    });

    return NextResponse.json({ ok: true, sessionId: session.id, url: session.url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create Stripe checkout session.";

    console.error("[stripe/checkout] error", error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
