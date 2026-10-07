import "server-only";

import { randomBytes } from "node:crypto";
import Stripe from "stripe";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import {
  PRODUCT_PACKAGE_BILLING_MODEL,
  productAcquisitionSurface,
} from "@/features/stripe/lib/stripe/product-packages";
import { resolveProductPackagePriceId } from "@/features/stripe/lib/server/product-package-price-contract";
import {
  attachStripeAcquisitionCheckout,
  beginStripeAcquisitionIntent,
  STRIPE_ACQUISITION_PURPOSE,
} from "@/features/stripe/lib/server/stripe-acquisition-intent";
import {
  attachEarlyAccessCheckout,
  EARLY_ACCESS_DURATION_MONTHS,
  EARLY_ACCESS_PERCENT_OFF,
  EARLY_ACCESS_TRIAL_DAYS,
  findEarlyAccessGrantByToken,
} from "@/features/stripe/lib/server/early-access-discount";

type CheckoutCreateParams = Stripe.Checkout.SessionCreateParams & {
  integration_identifier?: string;
  adaptive_pricing?: { enabled: boolean };
};

function mustEnv(name: string): string {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function baseUrl(): string {
  const configured = String(process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercel = String(process.env.VERCEL_URL ?? "").trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

function automaticTaxEnabled(): boolean {
  return String(process.env.STRIPE_AUTOMATIC_TAX_ENABLED ?? "").trim().toLowerCase() === "true";
}

function integrationIdentifier(grantId: string): string {
  return `profixiq_early_access_${grantId.replaceAll("-", "").slice(0, 12)}`;
}

async function ensureCustomer(input: {
  stripe: Stripe;
  grantId: string;
  applicationId: string;
  email: string;
  companyName: string;
  termsVersion: string;
}): Promise<string> {
  const customer = await input.stripe.customers.create(
    {
      email: input.email,
      name: input.companyName,
      metadata: {
        app: "profixiq",
        purpose: "early_access",
        early_access_grant_id: input.grantId,
        early_access_application_id: input.applicationId,
        offer_terms_version: input.termsVersion,
      },
    },
    { idempotencyKey: `profixiq:early-access-customer:${input.grantId}` },
  );
  return customer.id;
}

async function ensureCoupon(input: {
  stripe: Stripe;
  grantId: string;
  applicationId: string;
  termsVersion: string;
  existingCouponId: string | null;
  priceId: string;
}): Promise<string> {
  if (input.existingCouponId) return input.existingCouponId;

  const price = await input.stripe.prices.retrieve(input.priceId);
  const productId =
    typeof price.product === "string"
      ? price.product
      : price.product && typeof price.product === "object"
        ? price.product.id
        : null;
  if (!productId) throw new Error("Early Access product could not be verified.");

  const coupon = await input.stripe.coupons.create(
    {
      percent_off: EARLY_ACCESS_PERCENT_OFF,
      duration: "repeating",
      duration_in_months: EARLY_ACCESS_DURATION_MONTHS,
      name: "ProFixIQ Early Access — 30% for 6 months",
      applies_to: { products: [productId] },
      metadata: {
        purpose: "early_access",
        early_access_grant_id: input.grantId,
        early_access_application_id: input.applicationId,
        offer_terms_version: input.termsVersion,
      },
    },
    { idempotencyKey: `profixiq:early-access-coupon:${input.grantId}` },
  );

  return coupon.id;
}

export async function createEarlyAccessCheckout(token: string): Promise<{
  sessionId: string;
  url: string;
}> {
  const grant = await findEarlyAccessGrantByToken(token);
  const stripe = createStripeClient(mustEnv("STRIPE_SECRET_KEY"));
  const admin = createAdminSupabase();
  const priceId = await resolveProductPackagePriceId(stripe, grant.productPackage);
  const [couponId, customerId] = await Promise.all([
    ensureCoupon({
      stripe,
      grantId: grant.grantId,
      applicationId: grant.applicationId,
      termsVersion: grant.offerTermsVersion,
      existingCouponId: grant.stripeCouponId,
      priceId,
    }),
    ensureCustomer({
      stripe,
      grantId: grant.grantId,
      applicationId: grant.applicationId,
      email: grant.email,
      companyName: grant.companyName,
      termsVersion: grant.offerTermsVersion,
    }),
  ]);

  const intent = await beginStripeAcquisitionIntent({
    admin,
    requestKey: `early-access:${grant.grantId}`,
    nonce: randomBytes(32).toString("hex"),
    planKey: "starter",
    priceId,
    trialDays: EARLY_ACCESS_TRIAL_DAYS,
    foundingDiscountApplied: false,
  });

  const origin = baseUrl();
  const surface = productAcquisitionSurface(grant.productPackage);
  const successUrl = `${origin}/auth/callback?flow=acquisition&session_id={CHECKOUT_SESSION_ID}&surface=${surface}`;

  if (intent.status === "expired" || intent.status === "failed") {
    throw new Error("Early Access checkout attempt has expired.");
  }

  if (intent.checkoutSessionId) {
    const existing = await stripe.checkout.sessions.retrieve(intent.checkoutSessionId);
    if (existing.status === "open" && existing.url) {
      await attachEarlyAccessCheckout({
        grantId: grant.grantId,
        stripeCouponId: couponId,
        checkoutSessionId: existing.id,
        acquisitionIntentId: intent.id,
      });
      return { sessionId: existing.id, url: existing.url };
    }
    if (existing.status === "complete") {
      await attachEarlyAccessCheckout({
        grantId: grant.grantId,
        stripeCouponId: couponId,
        checkoutSessionId: existing.id,
        acquisitionIntentId: intent.id,
      });
      return {
        sessionId: existing.id,
        url: successUrl.replace("{CHECKOUT_SESSION_ID}", existing.id),
      };
    }
    throw new Error("Early Access checkout is no longer active.");
  }

  const metadata: Stripe.MetadataParam = {
    app: "profixiq",
    purpose: STRIPE_ACQUISITION_PURPOSE,
    source: "early_access",
    acquisition_intent_id: intent.id,
    acquisition_nonce: intent.nonce,
    plan_key: "starter",
    acquisition_surface: surface,
    package_key: grant.productPackage,
    price_id: priceId,
    pricing_model: PRODUCT_PACKAGE_BILLING_MODEL,
    trial_enabled: "true",
    trial_days: String(EARLY_ACCESS_TRIAL_DAYS),
    early_access_grant_id: grant.grantId,
    early_access_application_id: grant.applicationId,
    early_access_offer_terms_version: grant.offerTermsVersion,
  };

  const params: CheckoutCreateParams = {
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    discounts: [{ coupon: couponId }],
    payment_method_collection: "always",
    success_url: successUrl,
    cancel_url: `${origin}/early-access/approved?token=${encodeURIComponent(token)}`,
    client_reference_id: intent.id,
    adaptive_pricing: { enabled: true },
    ...(automaticTaxEnabled() ? { automatic_tax: { enabled: true } } : {}),
    subscription_data: {
      trial_period_days: EARLY_ACCESS_TRIAL_DAYS,
      trial_settings: {
        end_behavior: { missing_payment_method: "cancel" },
      },
      metadata,
    },
    metadata,
    integration_identifier: integrationIdentifier(grant.grantId),
  };

  const session = await stripe.checkout.sessions.create(params, {
    idempotencyKey: `profixiq:early-access-checkout:${grant.grantId}`,
  });
  if (!session.url) throw new Error("Stripe did not return an Early Access checkout URL.");

  await attachStripeAcquisitionCheckout({
    admin,
    intentId: intent.id,
    nonce: intent.nonce,
    checkoutSessionId: session.id,
  });
  await attachEarlyAccessCheckout({
    grantId: grant.grantId,
    stripeCouponId: couponId,
    checkoutSessionId: session.id,
    acquisitionIntentId: intent.id,
  });

  return { sessionId: session.id, url: session.url };
}
