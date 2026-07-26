export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";

import { readBoundedJson } from "@/features/shared/lib/server/bounded-json";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { OWNER_PIN_PURPOSES } from "@/features/shared/lib/server/owner-pin";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { PlanKey } from "@/features/stripe/lib/stripe/constants";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import {
  attachStripeAcquisitionCheckout,
  beginStripeAcquisitionIntent,
  STRIPE_ACQUISITION_PURPOSE,
} from "@/features/stripe/lib/server/stripe-acquisition-intent";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

const REQUEST_MAX_BYTES = 8 * 1024;
const PLAN_PRICE_ENV_BY_KEY: Record<PlanKey, string> = {
  starter: "STRIPE_PRICE_STARTER_MONTHLY",
  pro: "STRIPE_PRICE_PRO_MONTHLY",
  unlimited: "STRIPE_PRICE_UNLIMITED_MONTHLY",
};

const checkoutSchema = z
  .object({
    planKey: z.enum(["starter", "pro", "unlimited"]),
    checkoutAttemptId: z.string().uuid().optional(),
    flow: z.enum(["acquisition", "owner"]).optional(),
    source: z.enum(["pricing_cta"]).optional(),
    interval: z.literal("monthly").optional(),
    // Rolling-deploy compatibility only. These values are never trusted.
    priceId: z.string().optional(),
    shopId: z.string().nullable().optional(),
    supabaseUserId: z.string().nullable().optional(),
    successPath: z.string().optional(),
    cancelPath: z.string().optional(),
    enableTrial: z.boolean().optional(),
    trialDays: z.number().optional(),
    applyFoundingDiscount: z.boolean().optional(),
    demoId: z.string().nullable().optional(),
    intakeId: z.string().nullable().optional(),
  })
  .strict();

type ShopScope = Pick<
  DB["public"]["Tables"]["shops"]["Row"],
  | "id"
  | "email"
  | "shop_name"
  | "name"
  | "stripe_customer_id"
  | "stripe_subscription_id"
  | "stripe_subscription_status"
  | "stripe_trial_end"
>;

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function mustEnv(name: string): string {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function getBaseUrl(): string {
  const configured = String(process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercel = String(process.env.VERCEL_URL ?? "").trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

function getShopDisplayName(shop: ShopScope): string {
  return String(shop.shop_name ?? shop.name ?? "").trim() || "ProFixIQ Shop";
}

function resolveConfiguredPriceId(planKey: PlanKey): string {
  const envName = PLAN_PRICE_ENV_BY_KEY[planKey];
  const priceId = mustEnv(envName);
  if (!/^price_[A-Za-z0-9]+$/.test(priceId)) throw new Error(`invalid ${envName}`);
  return priceId;
}

function configuredTrialDays(): number {
  const parsed = Math.trunc(Number(process.env.STRIPE_TRIAL_DAYS ?? "14"));
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 60 ? parsed : 14;
}

function ownerTrialEligible(shop: ShopScope): boolean {
  const status = String(shop.stripe_subscription_status ?? "").trim().toLowerCase();
  return (
    !String(shop.stripe_subscription_id ?? "").trim() &&
    !shop.stripe_trial_end &&
    status !== "active" &&
    status !== "trialing"
  );
}

async function createCustomerIfMissing(input: {
  stripe: Stripe;
  admin: ReturnType<typeof createAdminSupabase>;
  shop: ShopScope;
  actorId: string;
}): Promise<string> {
  const existing = String(input.shop.stripe_customer_id ?? "").trim();
  if (existing) return existing;

  const customer = await input.stripe.customers.create(
    {
      email: input.shop.email ?? undefined,
      name: getShopDisplayName(input.shop),
      metadata: {
        shop_id: input.shop.id,
        supabase_user_id: input.actorId,
        source: "profixiq",
      },
    },
    { idempotencyKey: `profixiq:shop-customer:${input.shop.id}` },
  );

  const { error } = await input.admin
    .from("shops")
    .update({ stripe_customer_id: customer.id })
    .eq("id", input.shop.id);
  if (error) throw new Error(`shop customer persistence failed (${error.code ?? "unknown"})`);
  return customer.id;
}

function acquisitionMetadata(input: {
  intentId: string;
  nonce: string;
  planKey: PlanKey;
  priceId: string;
  trialDays: number;
  foundingDiscountApplied: boolean;
}): Stripe.MetadataParam {
  return {
    purpose: STRIPE_ACQUISITION_PURPOSE,
    source: "pricing_cta",
    acquisition_intent_id: input.intentId,
    acquisition_nonce: input.nonce,
    plan_key: input.planKey,
    price_id: input.priceId,
    trial_enabled: input.trialDays > 0 ? "true" : "false",
    trial_days: String(input.trialDays),
    founding_discount_applied: input.foundingDiscountApplied ? "true" : "false",
  };
}

export async function POST(req: Request) {
  try {
    const bodyResult = await readBoundedJson(req, REQUEST_MAX_BYTES);
    if (!bodyResult.ok) {
      return noStoreJson(
        { error: bodyResult.reason === "too_large" ? "Request too large" : "Invalid request" },
        bodyResult.reason === "too_large" ? 413 : 400,
      );
    }
    const parsed = checkoutSchema.safeParse(bodyResult.value);
    if (!parsed.success) return noStoreJson({ error: "Invalid checkout request" }, 400);

    const isAcquisition =
      parsed.data.flow === "acquisition" || parsed.data.source === "pricing_cta";
    if (parsed.data.flow === "owner" && parsed.data.source === "pricing_cta") {
      return noStoreJson({ error: "Invalid checkout flow" }, 400);
    }

    const secretKey = mustEnv("STRIPE_SECRET_KEY");
    const stripe = createStripeClient(secretKey);
    const priceId = resolveConfiguredPriceId(parsed.data.planKey);
    const baseUrl = getBaseUrl();
    const trialDays = configuredTrialDays();
    const couponId = String(process.env.STRIPE_FOUNDING_COUPON_ID ?? "").trim();
    const foundingDiscountApplied = Boolean(couponId);
    const attemptId = parsed.data.checkoutAttemptId ?? randomUUID();

    if (isAcquisition) {
      const admin = createAdminSupabase();
      const intent = await beginStripeAcquisitionIntent({
        admin,
        requestKey: `acq:${attemptId}`,
        nonce: randomBytes(32).toString("hex"),
        planKey: parsed.data.planKey,
        priceId,
        trialDays,
        foundingDiscountApplied,
      });

      const successUrl = `${baseUrl}/auth/callback?flow=acquisition&session_id={CHECKOUT_SESSION_ID}`;
      if (intent.status === "expired" || intent.status === "failed") {
        return noStoreJson({ error: "Checkout attempt expired" }, 409);
      }
      if (intent.checkoutSessionId) {
        const existing = await stripe.checkout.sessions.retrieve(intent.checkoutSessionId);
        if (existing.status === "open" && existing.url) {
          return noStoreJson({ ok: true, sessionId: existing.id, url: existing.url });
        }
        if (existing.status === "complete") {
          return noStoreJson({ ok: true, sessionId: existing.id, url: successUrl.replace("{CHECKOUT_SESSION_ID}", existing.id) });
        }
        return noStoreJson({ error: "Checkout attempt is no longer active" }, 409);
      }

      const metadata = acquisitionMetadata({
        intentId: intent.id,
        nonce: intent.nonce,
        planKey: parsed.data.planKey,
        priceId,
        trialDays,
        foundingDiscountApplied,
      });
      const session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          payment_method_types: ["card"],
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: successUrl,
          cancel_url: `${baseUrl}/compare-plans`,
          ...(!foundingDiscountApplied ? { allow_promotion_codes: true } : {}),
          client_reference_id: intent.id,
          ...(foundingDiscountApplied ? { discounts: [{ coupon: couponId }] } : {}),
          subscription_data: {
            ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
            metadata,
          },
          metadata,
        },
        { idempotencyKey: `profixiq:acquisition:${intent.id}` },
      );
      await attachStripeAcquisitionCheckout({
        admin,
        intentId: intent.id,
        nonce: intent.nonce,
        checkoutSessionId: session.id,
      });
      return noStoreJson({ ok: true, sessionId: session.id, url: session.url });
    }

    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageBilling",
      allowRoles: ["owner", "admin"],
      requireOwnerPin: true,
      ownerPinRequest: req,
      ownerPinAllowedPurposes: [OWNER_PIN_PURPOSES.BILLING, OWNER_PIN_PURPOSES.PRIVILEGED],
    });
    if (!access.ok) return access.response;

    const { data: shop, error: shopError } = await access.supabase
      .from("shops")
      .select(
        "id, email, shop_name, name, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_trial_end",
      )
      .eq("id", access.profile.shop_id)
      .maybeSingle<ShopScope>();
    if (shopError) return noStoreJson({ error: "Checkout unavailable" }, 503);
    if (!shop) return noStoreJson({ error: "Shop not found" }, 404);

    const admin = createAdminSupabase();
    const customerId = await createCustomerIfMissing({
      stripe,
      admin,
      shop,
      actorId: access.profile.id,
    });
    const enableTrial = ownerTrialEligible(shop);
    const metadata: Stripe.MetadataParam = {
      shop_id: shop.id,
      supabase_user_id: access.profile.id,
      purpose: "profixiq_subscription",
      source: "owner_settings",
      plan_key: parsed.data.planKey,
      price_id: priceId,
      trial_enabled: enableTrial ? "true" : "false",
      trial_days: enableTrial ? String(trialDays) : "0",
      founding_discount_applied: foundingDiscountApplied ? "true" : "false",
    };
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/dashboard/owner/settings#billing-stripe`,
        cancel_url: `${baseUrl}/dashboard/owner/settings#billing-stripe`,
        ...(!foundingDiscountApplied ? { allow_promotion_codes: true } : {}),
        ...(foundingDiscountApplied ? { discounts: [{ coupon: couponId }] } : {}),
        subscription_data: {
          ...(enableTrial ? { trial_period_days: trialDays } : {}),
          metadata,
        },
        metadata,
      },
      { idempotencyKey: `profixiq:shop-checkout:${shop.id}:${attemptId}` },
    );
    return noStoreJson({ ok: true, sessionId: session.id, url: session.url });
  } catch (error) {
    console.error("stripe_checkout_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return noStoreJson({ error: "Checkout unavailable" }, 503);
  }
}
