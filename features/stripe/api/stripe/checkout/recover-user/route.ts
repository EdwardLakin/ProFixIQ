import Stripe from "stripe";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { readBoundedJson } from "@/features/shared/lib/server/bounded-json";
import { OWNER_PIN_PURPOSES } from "@/features/shared/lib/server/owner-pin";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { isStripeSubscriptionAccessBearing } from "@/features/stripe/lib/stripe/subscriptionStatus";
import { syncCanonicalShopBilling } from "@/features/stripe/lib/server/canonical-shop-billing";
import {
  getStripeCheckoutEmail,
  getStripeCheckoutPriceId,
  getStripeCheckoutSubscription,
  isCompletedStripeAcquisitionSession,
  readStripeAcquisitionMetadata,
  recoverStrandedStripeAcquisitionIdentity,
  toStripeId,
} from "@/features/stripe/lib/server/stripe-acquisition-intent";

const REQUEST_MAX_BYTES = 2 * 1024;

const requestSchema = z
  .object({
    sessionId: z.string().regex(/^cs_[A-Za-z0-9_]+$/),
  })
  .strict();

type BillingArtifacts = {
  stripe_checkout_session_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function recoveryFailureStatus(reason: string): number {
  if (
    reason === "email_mismatch" ||
    reason === "billing_role_required" ||
    reason === "profile_shop_mismatch"
  ) {
    return 403;
  }

  if (
    reason === "canonical_identity_changed" ||
    reason === "intent_consumed" ||
    reason.includes("claimed_by_other") ||
    reason.includes("owned_by_other")
  ) {
    return 409;
  }

  return 400;
}

function isResourceMissing(error: unknown): boolean {
  return (
    error instanceof Stripe.errors.StripeError &&
    error.code === "resource_missing"
  );
}

async function verifyOldSubscriptionIsReplaceable(args: {
  stripe: Stripe;
  subscriptionId: string;
  replacementSubscriptionId: string;
}): Promise<"replaceable" | "same" | "access_bearing"> {
  if (args.subscriptionId === args.replacementSubscriptionId) {
    return "same";
  }

  try {
    const subscription = await args.stripe.subscriptions.retrieve(
      args.subscriptionId,
    );

    return isStripeSubscriptionAccessBearing(subscription.status)
      ? "access_bearing"
      : "replaceable";
  } catch (error) {
    if (isResourceMissing(error)) {
      return "replaceable";
    }

    throw error;
  }
}

export async function handleStripeCheckoutRecoverUser(req: Request) {
  try {
    const secretKey = String(process.env.STRIPE_SECRET_KEY ?? "").trim();
    if (!secretKey) {
      return noStoreJson({ error: "Billing unavailable" }, 503);
    }

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

    const bounded = await readBoundedJson(req, REQUEST_MAX_BYTES);
    if (!bounded.ok) {
      return noStoreJson(
        {
          error:
            bounded.reason === "too_large"
              ? "Request too large"
              : "Invalid request",
        },
        bounded.reason === "too_large" ? 413 : 400,
      );
    }

    const parsed = requestSchema.safeParse(bounded.value);
    if (!parsed.success) {
      return noStoreJson({ error: "Invalid checkout session" }, 400);
    }

    const admin = createAdminSupabase();

    const [profileResult, shopResult] = await Promise.all([
      admin
        .from("profiles")
        .select(
          "id, shop_id, stripe_checkout_session_id, stripe_customer_id, stripe_subscription_id",
        )
        .eq("id", access.profile.id)
        .maybeSingle(),
      admin
        .from("shops")
        .select(
          "id, stripe_checkout_session_id, stripe_customer_id, stripe_subscription_id",
        )
        .eq("id", access.profile.shop_id)
        .maybeSingle(),
    ]);

    if (profileResult.error || shopResult.error) {
      throw new Error("canonical billing identity lookup failed");
    }

    const profile = profileResult.data as
      | (BillingArtifacts & { id: string; shop_id: string | null })
      | null;
    const shop = shopResult.data as (BillingArtifacts & { id: string }) | null;

    if (
      !profile ||
      !shop ||
      profile.id !== access.profile.id ||
      profile.shop_id !== access.profile.shop_id ||
      shop.id !== access.profile.shop_id
    ) {
      return noStoreJson({ error: "Billing account unavailable" }, 409);
    }

    const stripe = createStripeClient(secretKey);

    const session = await stripe.checkout.sessions.retrieve(
      parsed.data.sessionId,
      {
        expand: ["subscription", "customer"],
      },
    );

    const metadata = readStripeAcquisitionMetadata(session.metadata);
    if (!metadata || !isCompletedStripeAcquisitionSession(session)) {
      return noStoreJson(
        { error: "Checkout is not eligible for account recovery" },
        400,
      );
    }

    const [priceId, checkoutEmail, subscription] = await Promise.all([
      getStripeCheckoutPriceId(stripe, session.id),
      getStripeCheckoutEmail(stripe, session),
      getStripeCheckoutSubscription(stripe, session),
    ]);

    const customerId = toStripeId(session.customer, "cus_");
    const subscriptionId = toStripeId(session.subscription, "sub_");

    if (
      !priceId ||
      priceId !== metadata.priceId ||
      !checkoutEmail ||
      !customerId ||
      !subscriptionId ||
      !subscription ||
      !isStripeSubscriptionAccessBearing(subscription.status)
    ) {
      return noStoreJson(
        { error: "Checkout identity could not be verified" },
        400,
      );
    }

    const accessEmail = String(access.profile.email ?? "")
      .trim()
      .toLowerCase();

    if (!accessEmail || checkoutEmail.toLowerCase() !== accessEmail) {
      return noStoreJson(
        { error: "Checkout does not belong to this account" },
        403,
      );
    }

    const oldSubscriptionIds = Array.from(
      new Set(
        [profile.stripe_subscription_id, shop.stripe_subscription_id].filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        ),
      ),
    );

    for (const oldSubscriptionId of oldSubscriptionIds) {
      const state = await verifyOldSubscriptionIsReplaceable({
        stripe,
        subscriptionId: oldSubscriptionId,
        replacementSubscriptionId: subscriptionId,
      });

      if (state === "access_bearing") {
        return noStoreJson(
          {
            error:
              "An existing active subscription is already linked to this account",
          },
          409,
        );
      }
    }

    const recovery = await recoverStrandedStripeAcquisitionIdentity({
      admin,
      authUserId: access.authUserId,
      profileId: access.profile.id,
      shopId: access.profile.shop_id,
      metadata,
      checkoutSessionId: session.id,
      customerId,
      subscriptionId,
      checkoutEmail,
      expectedProfileCheckoutSessionId: profile.stripe_checkout_session_id,
      expectedProfileCustomerId: profile.stripe_customer_id,
      expectedProfileSubscriptionId: profile.stripe_subscription_id,
      expectedShopCheckoutSessionId: shop.stripe_checkout_session_id,
      expectedShopCustomerId: shop.stripe_customer_id,
      expectedShopSubscriptionId: shop.stripe_subscription_id,
    });

    if (!recovery.recovered) {
      console.warn("stripe_acquisition_recovery_rejected", {
        reason: recovery.reason,
        userId: access.authUserId,
        profileId: access.profile.id,
        shopId: access.profile.shop_id,
      });

      return noStoreJson(
        { error: "Checkout cannot replace this billing identity" },
        recoveryFailureStatus(recovery.reason),
      );
    }

    const identityMetadata = {
      acquisition_intent_id: metadata.intentId,
      shop_id: access.profile.shop_id,
      source: "profixiq",
      supabase_user_id: access.authUserId,
    };

    await stripe.customers.update(
      customerId,
      { metadata: identityMetadata },
      {
        idempotencyKey: `profixiq:acquisition-recovery-customer:${metadata.intentId}:${access.authUserId}`,
      },
    );

    await stripe.subscriptions.update(
      subscriptionId,
      {
        metadata: {
          ...(subscription.metadata ?? {}),
          ...identityMetadata,
        },
      },
      {
        idempotencyKey: `profixiq:acquisition-recovery-subscription:${metadata.intentId}:${access.authUserId}`,
      },
    );

    await syncCanonicalShopBilling({
      stripe,
      supabase: admin,
      shopId: access.profile.shop_id,
      customerId,
      subscriptionId,
      checkoutSessionId: session.id,
    });

    return noStoreJson({
      recovered: true,
      shopId: access.profile.shop_id,
      surface: metadata.surface,
    });
  } catch (error) {
    console.error("stripe_acquisition_recovery_failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });

    return noStoreJson({ error: "Billing recovery unavailable" }, 503);
  }
}

export async function POST(req: Request) {
  return handleStripeCheckoutRecoverUser(req);
}
