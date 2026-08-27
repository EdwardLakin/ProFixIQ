import "server-only";

import Stripe from "stripe";

import type { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { PlanKey } from "@/features/stripe/lib/stripe/constants";
import {
  normalizeProductAcquisitionSurface,
  normalizeProductPackageKey,
  productAcquisitionSurface,
  type ProductAcquisitionSurface,
  type ProductPackageKey,
} from "@/features/stripe/lib/stripe/product-packages";
import { isStripeSubscriptionAccessBearing } from "@/features/stripe/lib/stripe/subscriptionStatus";

type AdminClient = ReturnType<typeof createAdminSupabase>;

export const STRIPE_ACQUISITION_PURPOSE = "profixiq_acquisition";

export type StripeAcquisitionMetadata = {
  intentId: string;
  nonce: string;
  planKey: PlanKey;
  packageKey: ProductPackageKey | null;
  priceId: string;
  surface: ProductAcquisitionSurface;
};

type BeginIntentRow = {
  intent_id: string;
  intent_nonce: string;
  checkout_session_id: string | null;
  intent_status: string;
};

type ClaimIntentRow = {
  claimed: boolean;
  denial_reason: string | null;
  shop_id: string | null;
};

export type BegunStripeAcquisitionIntent = {
  id: string;
  nonce: string;
  checkoutSessionId: string | null;
  status: string;
};

export type ClaimedStripeAcquisitionIntent =
  | { claimed: true; shopId: string | null; repeated: boolean }
  | { claimed: false; reason: string };

export type VerifiedStripeAcquisitionCheckout = {
  email: string;
  metadata: StripeAcquisitionMetadata;
  session: Stripe.Checkout.Session;
  subscription: Stripe.Subscription;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isPlanKey(value: string): value is PlanKey {
  return value === "starter" || value === "pro" || value === "unlimited";
}

export function toStripeId(value: unknown, prefix: string): string | null {
  if (typeof value === "string" && value.startsWith(prefix)) return value;
  if (value && typeof value === "object") {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.startsWith(prefix)) return id;
  }
  return null;
}

export function readStripeAcquisitionMetadata(
  metadata: Stripe.Metadata | null | undefined,
): StripeAcquisitionMetadata | null {
  const purpose = String(metadata?.purpose ?? "").trim();
  const intentId = String(metadata?.acquisition_intent_id ?? "").trim();
  const nonce = String(metadata?.acquisition_nonce ?? "").trim();
  const planKey = String(metadata?.plan_key ?? "").trim();
  const packageKeyRaw = String(metadata?.package_key ?? "").trim();
  const priceId = String(metadata?.price_id ?? "").trim();
  const surfaceRaw = String(metadata?.acquisition_surface ?? "").trim();
  const packageKey = normalizeProductPackageKey(packageKeyRaw);
  const explicitSurface = normalizeProductAcquisitionSurface(surfaceRaw);

  if ((packageKeyRaw && !packageKey) || (surfaceRaw && !explicitSurface)) {
    return null;
  }

  // Legacy plan-based sessions did not carry package identity and belong to
  // Shop. Package sessions derive their surface from the server-owned package
  // contract; an explicit Stripe value must agree with that derivation.
  const derivedSurface = packageKey
    ? productAcquisitionSurface(packageKey)
    : "shop";
  if (explicitSurface && explicitSurface !== derivedSurface) return null;

  if (
    purpose !== STRIPE_ACQUISITION_PURPOSE ||
    !isUuid(intentId) ||
    !/^[0-9a-f]{64}$/.test(nonce) ||
    !isPlanKey(planKey) ||
    !priceId.startsWith("price_")
  ) {
    return null;
  }

  return {
    intentId,
    nonce,
    planKey,
    packageKey,
    priceId,
    surface: explicitSurface ?? derivedSurface,
  };
}

export function isCompletedStripeAcquisitionSession(
  session: Stripe.Checkout.Session,
): boolean {
  return (
    session.mode === "subscription" &&
    session.status === "complete" &&
    (session.payment_status === "paid" ||
      session.payment_status === "no_payment_required") &&
    Boolean(toStripeId(session.customer, "cus_")) &&
    Boolean(toStripeId(session.subscription, "sub_"))
  );
}

export async function getStripeCheckoutPriceId(
  stripe: Stripe,
  sessionId: string,
): Promise<string | null> {
  const items = await stripe.checkout.sessions.listLineItems(sessionId, {
    limit: 2,
  });
  if (items.data.length !== 1 || items.data[0]?.quantity !== 1) return null;
  return toStripeId(items.data[0]?.price, "price_");
}

export async function getStripeCheckoutEmail(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  const checkoutEmail = String(session.customer_details?.email ?? "")
    .trim()
    .toLowerCase();
  if (checkoutEmail) return checkoutEmail;

  if (
    session.customer &&
    typeof session.customer === "object" &&
    !("deleted" in session.customer)
  ) {
    const expandedEmail = String(session.customer.email ?? "")
      .trim()
      .toLowerCase();
    if (expandedEmail) return expandedEmail;
  }

  const customerId = toStripeId(session.customer, "cus_");
  if (!customerId) return null;
  const customer = await stripe.customers.retrieve(customerId);
  if ("deleted" in customer && customer.deleted) return null;
  return (
    String(customer.email ?? "")
      .trim()
      .toLowerCase() || null
  );
}

export async function getStripeCheckoutSubscription(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<Stripe.Subscription | null> {
  if (session.subscription && typeof session.subscription === "object") {
    return session.subscription;
  }

  const subscriptionId = toStripeId(session.subscription, "sub_");
  return subscriptionId ? stripe.subscriptions.retrieve(subscriptionId) : null;
}

/**
 * Verify the complete server-owned acquisition contract before an existing
 * account is allowed to establish a session for the claim handoff.
 *
 * Invalid or incomplete checkouts return null. Stripe/service failures throw
 * so callers can fail closed without presenting a permanent eligibility
 * denial for a transient billing outage.
 */
export async function verifyStripeAcquisitionCheckout(
  stripe: Stripe,
  sessionId: string,
): Promise<VerifiedStripeAcquisitionCheckout | null> {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription", "customer"],
  });
  const metadata = readStripeAcquisitionMetadata(session.metadata);
  if (!metadata || !isCompletedStripeAcquisitionSession(session)) return null;

  const [priceId, email, subscription] = await Promise.all([
    getStripeCheckoutPriceId(stripe, session.id),
    getStripeCheckoutEmail(stripe, session),
    getStripeCheckoutSubscription(stripe, session),
  ]);
  if (
    priceId !== metadata.priceId ||
    !email ||
    !subscription ||
    !isStripeSubscriptionAccessBearing(subscription.status)
  ) {
    return null;
  }

  return { email, metadata, session, subscription };
}

export async function beginStripeAcquisitionIntent(input: {
  admin: AdminClient;
  requestKey: string;
  nonce: string;
  planKey: PlanKey;
  priceId: string;
  trialDays: number;
  foundingDiscountApplied: boolean;
}): Promise<BegunStripeAcquisitionIntent> {
  const { data, error } = await input.admin.rpc(
    "begin_stripe_acquisition_intent",
    {
      p_founding_discount_applied: input.foundingDiscountApplied,
      p_nonce: input.nonce,
      p_plan_key: input.planKey,
      p_request_key: input.requestKey,
      p_stripe_price_id: input.priceId,
      p_trial_days: input.trialDays,
    },
  );
  if (error)
    throw new Error(
      `acquisition intent unavailable (${error.code ?? "unknown"})`,
    );

  const row = Array.isArray(data)
    ? (data[0] as BeginIntentRow | undefined)
    : undefined;
  if (!row?.intent_id || !row.intent_nonce) {
    throw new Error("acquisition intent unavailable (empty_result)");
  }
  return {
    id: row.intent_id,
    nonce: row.intent_nonce,
    checkoutSessionId: row.checkout_session_id,
    status: row.intent_status,
  };
}

export async function attachStripeAcquisitionCheckout(input: {
  admin: AdminClient;
  intentId: string;
  nonce: string;
  checkoutSessionId: string;
}): Promise<void> {
  const { data, error } = await input.admin.rpc(
    "attach_stripe_acquisition_checkout",
    {
      p_checkout_session_id: input.checkoutSessionId,
      p_intent_id: input.intentId,
      p_nonce: input.nonce,
    },
  );
  if (error || data !== true) {
    throw new Error(
      `acquisition checkout attachment failed (${error?.code ?? "rejected"})`,
    );
  }
}

export async function recordStripeAcquisitionCompletion(input: {
  admin: AdminClient;
  metadata: StripeAcquisitionMetadata;
  checkoutSessionId: string;
  customerId: string;
  subscriptionId: string;
  checkoutEmail: string;
  eventId: string;
  eventCreatedAt: string;
}): Promise<boolean> {
  const { data, error } = await input.admin.rpc(
    "record_stripe_acquisition_completion",
    {
      p_checkout_email: input.checkoutEmail,
      p_checkout_session_id: input.checkoutSessionId,
      p_customer_id: input.customerId,
      p_event_created_at: input.eventCreatedAt,
      p_event_id: input.eventId,
      p_intent_id: input.metadata.intentId,
      p_nonce: input.metadata.nonce,
      p_stripe_price_id: input.metadata.priceId,
      p_subscription_id: input.subscriptionId,
    },
  );
  if (error)
    throw new Error(
      `acquisition completion unavailable (${error.code ?? "unknown"})`,
    );
  return data === true;
}

export async function claimStripeAcquisitionIntent(input: {
  admin: AdminClient;
  metadata: StripeAcquisitionMetadata;
  checkoutSessionId: string;
  customerId: string;
  subscriptionId: string;
  checkoutEmail: string;
  userId: string;
}): Promise<ClaimedStripeAcquisitionIntent> {
  const { data, error } = await input.admin.rpc(
    "claim_stripe_acquisition_intent",
    {
      p_checkout_email: input.checkoutEmail,
      p_checkout_session_id: input.checkoutSessionId,
      p_customer_id: input.customerId,
      p_intent_id: input.metadata.intentId,
      p_nonce: input.metadata.nonce,
      p_stripe_price_id: input.metadata.priceId,
      p_subscription_id: input.subscriptionId,
      p_user_id: input.userId,
    },
  );
  if (error)
    throw new Error(
      `acquisition claim unavailable (${error.code ?? "unknown"})`,
    );

  const row = Array.isArray(data)
    ? (data[0] as ClaimIntentRow | undefined)
    : undefined;
  if (!row?.claimed) {
    return { claimed: false, reason: row?.denial_reason ?? "claim_rejected" };
  }
  return {
    claimed: true,
    shopId: row.shop_id,
    repeated: row.denial_reason === "already_claimed",
  };
}
