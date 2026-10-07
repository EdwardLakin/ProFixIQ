import "server-only";

import type Stripe from "stripe";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { EARLY_ACCESS_DURATION_MONTHS } from "@/features/stripe/lib/server/early-access-discount";

type JsonObject = Record<string, unknown>;

type GrantRow = {
  id: string;
  status: string;
  stripe_coupon_id: string | null;
  metadata: unknown;
};

function metadataObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function grantIdFromSubscription(subscription: Stripe.Subscription): string | null {
  const value = String(subscription.metadata?.early_access_grant_id ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

/**
 * Count only successful paid subscription-cycle invoices. The Checkout coupon is
 * intentionally `forever` so the 7-day trial cannot consume part of the offer;
 * after the sixth unique paid cycle we remove the Stripe subscription discount,
 * making the seventh paid invoice standard price.
 */
export async function recordEarlyAccessPaidInvoice(input: {
  stripe: Stripe;
  subscription: Stripe.Subscription;
  invoice: Stripe.Invoice;
}): Promise<void> {
  if (input.invoice.amount_paid <= 0 || input.invoice.billing_reason !== "subscription_cycle") {
    return;
  }

  const grantId = grantIdFromSubscription(input.subscription);
  if (!grantId) return;

  const admin = createAdminSupabase();
  const { data: grant, error: loadError } = await admin
    .from("billing_discount_grants")
    .select("id, status, stripe_coupon_id, metadata")
    .eq("id", grantId)
    .in("status", ["active", "redeemed"])
    .maybeSingle<GrantRow>();

  if (loadError) {
    throw new Error(`Failed to load Early Access paid-period grant: ${loadError.message}`);
  }
  if (!grant) return;

  const metadata = metadataObject(grant.metadata);
  const expectedSubscriptionId = String(metadata.subscription_id ?? "").trim();
  if (expectedSubscriptionId && expectedSubscriptionId !== input.subscription.id) {
    throw new Error("Early Access paid invoice does not match the granted subscription.");
  }

  const paidInvoiceIds = stringArray(metadata.paid_invoice_ids);
  if (paidInvoiceIds.includes(input.invoice.id)) return;

  const nextInvoiceIds = [...paidInvoiceIds, input.invoice.id];
  const paidPeriods = nextInvoiceIds.length;
  const offerComplete = paidPeriods >= EARLY_ACCESS_DURATION_MONTHS;

  if (offerComplete && input.subscription.discount) {
    await input.stripe.subscriptions.deleteDiscount(input.subscription.id);
  }

  const { error: updateError } = await admin
    .from("billing_discount_grants")
    .update({
      metadata: {
        ...metadata,
        paid_invoice_ids: nextInvoiceIds,
        paid_periods_redeemed: paidPeriods,
        last_paid_invoice_id: input.invoice.id,
        last_paid_period_at: new Date().toISOString(),
        ...(offerComplete ? { discount_completed_at: new Date().toISOString() } : {}),
      },
    })
    .eq("id", grant.id)
    .in("status", ["active", "redeemed"]);

  if (updateError) {
    throw new Error(`Failed to record Early Access paid period: ${updateError.message}`);
  }
}
