import { NextResponse } from "next/server";
import { z } from "zod";

import { readBoundedJson } from "@/features/shared/lib/server/bounded-json";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { isStripeSubscriptionAccessBearing } from "@/features/stripe/lib/stripe/subscriptionStatus";
import { reconcileShopBillingFromUser } from "@/features/stripe/lib/server/canonical-shop-billing";
import {
  claimStripeAcquisitionIntent,
  getStripeCheckoutEmail,
  getStripeCheckoutPriceId,
  getStripeCheckoutSubscription,
  isCompletedStripeAcquisitionSession,
  readStripeAcquisitionMetadata,
  toStripeId,
} from "@/features/stripe/lib/server/stripe-acquisition-intent";

const REQUEST_MAX_BYTES = 2 * 1024;
const requestSchema = z
  .object({ sessionId: z.string().regex(/^cs_[A-Za-z0-9_]+$/) })
  .strict();

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function claimFailureStatus(reason: string): number {
  if (reason === "email_mismatch" || reason === "billing_role_required")
    return 403;
  if (
    reason.includes("conflict") ||
    reason.includes("linked") ||
    reason === "intent_consumed"
  ) {
    return 409;
  }
  return 400;
}

export async function handleStripeCheckoutLinkUser(req: Request) {
  try {
    const secretKey = String(process.env.STRIPE_SECRET_KEY ?? "").trim();
    if (!secretKey) return noStoreJson({ error: "Billing unavailable" }, 503);

    const supabase = createServerSupabaseRoute();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return noStoreJson({ error: "Unauthorized" }, 401);

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
    if (!parsed.success)
      return noStoreJson({ error: "Invalid checkout session" }, 400);

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
        { error: "Checkout is not eligible for account linking" },
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

    const admin = createAdminSupabase();
    const claim = await claimStripeAcquisitionIntent({
      admin,
      metadata,
      checkoutSessionId: session.id,
      customerId,
      subscriptionId,
      checkoutEmail,
      userId: user.id,
    });
    if (!claim.claimed) {
      console.warn("stripe_acquisition_claim_rejected", {
        reason: claim.reason,
        userId: user.id,
      });
      return noStoreJson(
        { error: "Checkout cannot be linked to this account" },
        claimFailureStatus(claim.reason),
      );
    }

    if (user.app_metadata?.profixiq_portal_only === true) {
      const { error: identityUpgradeError } =
        await admin.auth.admin.updateUserById(user.id, {
          app_metadata: {
            ...user.app_metadata,
            profixiq_portal_only: false,
          },
        });
      if (identityUpgradeError) {
        console.error("stripe_acquisition_identity_upgrade_failed", {
          userId: user.id,
          message: identityUpgradeError.message,
        });
        return noStoreJson({ error: "Account upgrade unavailable" }, 503);
      }
    }

    const identityMetadata = {
      acquisition_intent_id: metadata.intentId,
      shop_id: claim.shopId ?? "",
      source: "profixiq",
      supabase_user_id: user.id,
    };
    await stripe.customers.update(
      customerId,
      { metadata: identityMetadata },
      {
        idempotencyKey: `profixiq:acquisition-customer-link:${metadata.intentId}:${user.id}`,
      },
    );

    await stripe.subscriptions.update(
      subscriptionId,
      { metadata: { ...(subscription.metadata ?? {}), ...identityMetadata } },
      {
        idempotencyKey: `profixiq:acquisition-subscription-link:${metadata.intentId}:${user.id}`,
      },
    );

    if (claim.shopId) {
      await reconcileShopBillingFromUser({
        stripe,
        supabase: admin,
        userId: user.id,
        shopId: claim.shopId,
      });
    }

    return noStoreJson({
      success: true,
      shopLinked: Boolean(claim.shopId),
      repeated: claim.repeated,
    });
  } catch (error) {
    console.error("stripe_acquisition_link_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return noStoreJson({ error: "Checkout linking unavailable" }, 503);
  }
}

export async function POST(req: Request) {
  return handleStripeCheckoutLinkUser(req);
}
