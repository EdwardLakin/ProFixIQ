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
  PRODUCT_PACKAGE_BILLING_MODEL,
  PRODUCT_PACKAGE_KEYS,
  productAcquisitionSurface,
  type ProductAcquisitionSurface,
  type ProductPackageKey,
} from "@/features/stripe/lib/stripe/product-packages";
import { resolveProductPackagePriceId } from "@/features/stripe/lib/server/product-package-price-contract";
import { resolveStripePlanPriceId } from "@/features/stripe/lib/server/stripe-price-contract";
import {
  attachStripeAcquisitionCheckout,
  beginStripeAcquisitionIntent,
  STRIPE_ACQUISITION_PURPOSE,
} from "@/features/stripe/lib/server/stripe-acquisition-intent";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type CheckoutCreateParams = Stripe.Checkout.SessionCreateParams & {
  integration_identifier?: string;
};

const REQUEST_MAX_BYTES = 8 * 1024;

const checkoutSchema = z
  .object({
    packageKey: z.enum(PRODUCT_PACKAGE_KEYS).optional(),
    // Rolling-deploy compatibility for pre-package clients and subscriptions.
    planKey: z.enum(["starter", "unlimited"]).optional(),
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
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.packageKey) === Boolean(value.planKey)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose exactly one subscription package",
      });
    }
  });

type CheckoutSelection =
  | {
      packageKey: ProductPackageKey;
      legacyPlanKey: null;
      acquisitionPlanKey: PlanKey;
      acquisitionSurface: ProductAcquisitionSurface;
      pricingModel: typeof PRODUCT_PACKAGE_BILLING_MODEL;
    }
  | {
      packageKey: null;
      legacyPlanKey: PlanKey;
      acquisitionPlanKey: PlanKey;
      acquisitionSurface: ProductAcquisitionSurface;
      pricingModel: "base_plus_seats_v2";
    };

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

function configuredTrialDays(): number {
  const parsed = Math.trunc(Number(process.env.STRIPE_TRIAL_DAYS ?? "7"));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 60 ? parsed : 7;
}

function automaticTaxEnabled(): boolean {
  return (
    String(process.env.STRIPE_AUTOMATIC_TAX_ENABLED ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}

function integrationIdentifier(prefix: string): string {
  return `${prefix}_${randomBytes(4).toString("hex")}`;
}

function ownerTrialEligible(shop: ShopScope): boolean {
  const status = String(shop.stripe_subscription_status ?? "")
    .trim()
    .toLowerCase();
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
        app: "profixiq",
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
  if (error)
    throw new Error(
      `shop customer persistence failed (${error.code ?? "unknown"})`,
    );
  return customer.id;
}

function acquisitionMetadata(input: {
  intentId: string;
  nonce: string;
  selection: CheckoutSelection;
  priceId: string;
  trialDays: number;
}): Stripe.MetadataParam {
  return {
    app: "profixiq",
    purpose: STRIPE_ACQUISITION_PURPOSE,
    source: "pricing_cta",
    acquisition_intent_id: input.intentId,
    acquisition_nonce: input.nonce,
    plan_key: input.selection.acquisitionPlanKey,
    acquisition_surface: input.selection.acquisitionSurface,
    ...(input.selection.packageKey
      ? { package_key: input.selection.packageKey }
      : {}),
    price_id: input.priceId,
    pricing_model: input.selection.pricingModel,
    trial_enabled: input.trialDays > 0 ? "true" : "false",
    trial_days: String(input.trialDays),
  };
}

function resolveCheckoutSelection(input: {
  packageKey?: ProductPackageKey;
  planKey?: PlanKey;
}): CheckoutSelection {
  if (input.packageKey) {
    return {
      packageKey: input.packageKey,
      legacyPlanKey: null,
      // The acquisition ledger keeps the historical canonical plan alias while
      // package_key carries the new commercial entitlement.
      acquisitionPlanKey: "starter",
      acquisitionSurface: productAcquisitionSurface(input.packageKey),
      pricingModel: PRODUCT_PACKAGE_BILLING_MODEL,
    };
  }

  return {
    packageKey: null,
    legacyPlanKey: input.planKey ?? "starter",
    acquisitionPlanKey: input.planKey ?? "starter",
    acquisitionSurface: "shop",
    pricingModel: "base_plus_seats_v2",
  };
}

async function resolveCheckoutPriceId(
  stripe: Stripe,
  selection: CheckoutSelection,
): Promise<string> {
  return selection.packageKey
    ? resolveProductPackagePriceId(stripe, selection.packageKey)
    : resolveStripePlanPriceId(stripe, selection.legacyPlanKey);
}

function buildCheckoutParams(input: {
  customerId?: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  clientReferenceId?: string;
  trialDays: number;
  metadata: Stripe.MetadataParam;
  identifierPrefix: string;
}): CheckoutCreateParams {
  return {
    mode: "subscription",
    ...(input.customerId ? { customer: input.customerId } : {}),
    line_items: [{ price: input.priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    allow_promotion_codes: true,
    payment_method_collection: input.trialDays > 0 ? "if_required" : "always",
    ...(input.clientReferenceId
      ? { client_reference_id: input.clientReferenceId }
      : {}),
    ...(automaticTaxEnabled() ? { automatic_tax: { enabled: true } } : {}),
    subscription_data: {
      ...(input.trialDays > 0
        ? {
            trial_period_days: input.trialDays,
            trial_settings: {
              end_behavior: { missing_payment_method: "cancel" },
            },
          }
        : {}),
      metadata: input.metadata,
    },
    metadata: input.metadata,
    integration_identifier: integrationIdentifier(input.identifierPrefix),
  };
}

export async function POST(req: Request) {
  try {
    const bodyResult = await readBoundedJson(req, REQUEST_MAX_BYTES);
    if (!bodyResult.ok) {
      return noStoreJson(
        {
          error:
            bodyResult.reason === "too_large"
              ? "Request too large"
              : "Invalid request",
        },
        bodyResult.reason === "too_large" ? 413 : 400,
      );
    }
    const parsed = checkoutSchema.safeParse(bodyResult.value);
    if (!parsed.success)
      return noStoreJson({ error: "Invalid checkout request" }, 400);

    const isAcquisition =
      parsed.data.flow === "acquisition" ||
      parsed.data.source === "pricing_cta";
    if (parsed.data.flow === "owner" && parsed.data.source === "pricing_cta") {
      return noStoreJson({ error: "Invalid checkout flow" }, 400);
    }

    const stripe = createStripeClient(mustEnv("STRIPE_SECRET_KEY"));
    const selection = resolveCheckoutSelection(parsed.data);
    const priceId = await resolveCheckoutPriceId(stripe, selection);
    const baseUrl = getBaseUrl();
    const trialDays = configuredTrialDays();
    const attemptId = parsed.data.checkoutAttemptId ?? randomUUID();

    if (isAcquisition) {
      const admin = createAdminSupabase();
      const intent = await beginStripeAcquisitionIntent({
        admin,
        requestKey: `acq:${attemptId}`,
        nonce: randomBytes(32).toString("hex"),
        planKey: selection.acquisitionPlanKey,
        priceId,
        trialDays,
        foundingDiscountApplied: false,
      });

      const successUrl = `${baseUrl}/auth/callback?flow=acquisition&session_id={CHECKOUT_SESSION_ID}&surface=${selection.acquisitionSurface}`;
      if (intent.status === "expired" || intent.status === "failed") {
        return noStoreJson({ error: "Checkout attempt expired" }, 409);
      }
      if (intent.checkoutSessionId) {
        const existing = await stripe.checkout.sessions.retrieve(
          intent.checkoutSessionId,
        );
        if (existing.status === "open" && existing.url) {
          return noStoreJson({
            ok: true,
            sessionId: existing.id,
            url: existing.url,
          });
        }
        if (existing.status === "complete") {
          return noStoreJson({
            ok: true,
            sessionId: existing.id,
            url: successUrl.replace("{CHECKOUT_SESSION_ID}", existing.id),
          });
        }
        return noStoreJson(
          { error: "Checkout attempt is no longer active" },
          409,
        );
      }

      const metadata = acquisitionMetadata({
        intentId: intent.id,
        nonce: intent.nonce,
        selection,
        priceId,
        trialDays,
      });
      const session = await stripe.checkout.sessions.create(
        buildCheckoutParams({
          priceId,
          successUrl,
          cancelUrl: `${baseUrl}/compare-plans`,
          clientReferenceId: intent.id,
          trialDays,
          metadata,
          identifierPrefix: "profixiq_acquisition",
        }),
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
      requiredProductCapabilities: [],
      requireOwnerPin: true,
      ownerPinRequest: req,
      ownerPinAllowedPurposes: [
        OWNER_PIN_PURPOSES.BILLING,
        OWNER_PIN_PURPOSES.PRIVILEGED,
      ],
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
      app: "profixiq",
      shop_id: shop.id,
      supabase_user_id: access.profile.id,
      purpose: "profixiq_subscription",
      source: "owner_settings",
      plan_key: selection.acquisitionPlanKey,
      ...(selection.packageKey ? { package_key: selection.packageKey } : {}),
      price_id: priceId,
      pricing_model: selection.pricingModel,
      trial_enabled: enableTrial ? "true" : "false",
      trial_days: enableTrial ? String(trialDays) : "0",
    };
    const session = await stripe.checkout.sessions.create(
      buildCheckoutParams({
        customerId,
        priceId,
        successUrl: `${baseUrl}/account/billing`,
        cancelUrl: `${baseUrl}/account/billing`,
        trialDays: enableTrial ? trialDays : 0,
        metadata,
        identifierPrefix: "profixiq_owner",
      }),
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
