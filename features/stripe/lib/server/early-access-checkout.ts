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
  type BegunStripeAcquisitionIntent,
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

type ResolvedIntent = {
  intent: BegunStripeAcquisitionIntent;
  existingSession: Stripe.Checkout.Session | null;
};

type RpcError = { message?: string; code?: string | null };
type EarlyAccessRpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
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
  return (
    String(process.env.STRIPE_AUTOMATIC_TAX_ENABLED ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}

function integrationIdentifier(intentId: string): string {
  return `profixiq_early_access_${intentId.replaceAll("-", "").slice(0, 12)}`;
}

async function retireExpiredEarlyAccessIntent(input: {
  admin: ReturnType<typeof createAdminSupabase>;
  grantId: string;
  checkoutAttemptNamespace: string;
  intentId: string;
  checkoutSessionId: string;
}): Promise<void> {
  const client = input.admin as unknown as EarlyAccessRpcClient;
  const { data, error } = await client.rpc(
    "retire_early_access_acquisition_intent",
    {
      p_grant_id: input.grantId,
      p_checkout_attempt_namespace: input.checkoutAttemptNamespace,
      p_intent_id: input.intentId,
      p_checkout_session_id: input.checkoutSessionId,
    },
  );
  if (error || data !== true) {
    throw new Error(
      `Early Access expired checkout could not be retired (${error?.code ?? "rejected"}).`,
    );
  }
}

async function ensureCustomer(input: {
  stripe: Stripe;
  grantId: string;
  applicationId: string;
  email: string;
  companyName: string;
  termsVersion: string;
  existingCustomerId: string | null;
}): Promise<string> {
  // Stripe idempotency keys only last about a day, so the customer created for
  // a grant is persisted on it and reused; a later call must not mint a second
  // customer that no longer matches an already-attached Checkout Session.
  if (input.existingCustomerId) return input.existingCustomerId;

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

async function resolveUsableIntent(input: {
  stripe: Stripe;
  admin: ReturnType<typeof createAdminSupabase>;
  grantId: string;
  checkoutAttemptNamespace: string;
  priceId: string;
}): Promise<ResolvedIntent> {
  const requestKeyPrefix =
    `early-access:${input.grantId}:${input.checkoutAttemptNamespace}`;
  let requestKey = requestKeyPrefix;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const intent = await beginStripeAcquisitionIntent({
      admin: input.admin,
      requestKey,
      nonce: randomBytes(32).toString("hex"),
      planKey: "starter",
      priceId: input.priceId,
      trialDays: EARLY_ACCESS_TRIAL_DAYS,
      foundingDiscountApplied: false,
    });
    const intentDead = intent.status === "expired" || intent.status === "failed";

    if (intent.checkoutSessionId) {
      let existingSession = await input.stripe.checkout.sessions.retrieve(
        intent.checkoutSessionId,
      );

      if (intentDead) {
        if (existingSession.status === "complete") {
          // Stripe completed the purchase, but the canonical intent expired
          // before authenticated claim. The link-user route owns the narrow
          // verified recovery adapter for this exact artifact set.
          return { intent, existingSession };
        }

        if (existingSession.status === "open") {
          try {
            existingSession = await input.stripe.checkout.sessions.expire(
              existingSession.id,
            );
          } catch (error) {
            const refreshed = await input.stripe.checkout.sessions.retrieve(
              existingSession.id,
            );
            if (refreshed.status === "complete") {
              return { intent, existingSession: refreshed };
            }
            if (refreshed.status !== "expired") throw error;
            existingSession = refreshed;
          }
        }

        requestKey = `${requestKeyPrefix}:after-session:${existingSession.id}`;
        continue;
      }

      if (
        existingSession.status === "open" ||
        existingSession.status === "complete"
      ) {
        return { intent, existingSession };
      }

      if (existingSession.status === "expired") {
        await retireExpiredEarlyAccessIntent({
          admin: input.admin,
          grantId: input.grantId,
          checkoutAttemptNamespace: input.checkoutAttemptNamespace,
          intentId: intent.id,
          checkoutSessionId: existingSession.id,
        });
      }

      requestKey = `${requestKeyPrefix}:after-session:${existingSession.id}`;
      continue;
    }

    if (intentDead) {
      requestKey = `${requestKeyPrefix}:after-intent:${intent.id}`;
      continue;
    }

    return { intent, existingSession: null };
  }

  throw new Error(
    "Early Access checkout has too many abandoned attempts. Reissue the approval link and try again.",
  );
}

export async function createEarlyAccessCheckout(token: string): Promise<{
  sessionId: string;
  url: string;
}> {
  const grant = await findEarlyAccessGrantByToken(token);
  const stripe = createStripeClient(mustEnv("STRIPE_SECRET_KEY"));
  const admin = createAdminSupabase();
  const priceId = await resolveProductPackagePriceId(
    stripe,
    grant.productPackage,
  );
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
      existingCustomerId: grant.stripeCustomerId,
    }),
  ]);

  const { intent, existingSession } = await resolveUsableIntent({
    stripe,
    admin,
    grantId: grant.grantId,
    checkoutAttemptNamespace: grant.checkoutAttemptNamespace,
    priceId,
  });

  const origin = baseUrl();
  const surface = productAcquisitionSurface(grant.productPackage);
  const successUrl = `${origin}/auth/callback?flow=acquisition&session_id={CHECKOUT_SESSION_ID}&surface=${surface}`;

  if (existingSession) {
    await attachEarlyAccessCheckout({
      grantId: grant.grantId,
      checkoutAttemptNamespace: grant.checkoutAttemptNamespace,
      stripeCouponId: couponId,
      stripeCustomerId: customerId,
      checkoutSessionId: existingSession.id,
      acquisitionIntentId: intent.id,
    });
    if (existingSession.status === "open" && existingSession.url) {
      return { sessionId: existingSession.id, url: existingSession.url };
    }
    if (existingSession.status === "complete") {
      return {
        sessionId: existingSession.id,
        url: successUrl.replace("{CHECKOUT_SESSION_ID}", existingSession.id),
      };
    }
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
    // Keep bearer approval tokens out of Stripe URLs and keep retries stable
    // even if an Ops operator rotates the private approval link.
    cancel_url: `${origin}/early-access/approved/cancelled`,
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
    integration_identifier: integrationIdentifier(intent.id),
  };

  const session = await stripe.checkout.sessions.create(params, {
    idempotencyKey: `profixiq:early-access-checkout:${intent.id}`,
  });
  if (!session.url) {
    throw new Error("Stripe did not return an Early Access checkout URL.");
  }

  await attachStripeAcquisitionCheckout({
    admin,
    intentId: intent.id,
    nonce: intent.nonce,
    checkoutSessionId: session.id,
  });
  await attachEarlyAccessCheckout({
    grantId: grant.grantId,
    checkoutAttemptNamespace: grant.checkoutAttemptNamespace,
    stripeCouponId: couponId,
    stripeCustomerId: customerId,
    checkoutSessionId: session.id,
    acquisitionIntentId: intent.id,
  });

  return { sessionId: session.id, url: session.url };
}
