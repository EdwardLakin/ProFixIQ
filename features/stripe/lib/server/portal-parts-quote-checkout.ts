import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { getShopPaymentSettings } from "@/features/stripe/lib/server/shop-payment-settings";
import { PORTAL_PARTS_QUOTE_PAYMENT_PURPOSE } from "@/features/portal/lib/partsQuotePresentation";

type DB = Database;
type CheckoutCreateParams = Stripe.Checkout.SessionCreateParams & {
  integration_identifier?: string;
};

type ShopConnectRow = {
  id: string;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
  stripe_connect_charge_model?: string | null;
};

export type PortalPartsQuoteCheckoutInput = {
  stripe: Stripe;
  supabase: SupabaseClient<DB>;
  shopId: string;
  requestId: string;
  description: string;
  totalCents: number;
  currency: string;
  customerEmail?: string | null;
  customerId: string;
  createdBy: string;
  successUrl: string;
  cancelUrl: string;
};

function normalizeCurrency(value: string): "cad" | "usd" {
  return value.trim().toLowerCase() === "usd" ? "usd" : "cad";
}

/**
 * Charges an approved parts quote on the shop's own connected Stripe account
 * (direct charge), using the same readiness gates and platform fee as portal
 * invoice payments.
 */
export async function createPortalPartsQuoteCheckout(
  input: PortalPartsQuoteCheckoutInput,
): Promise<Stripe.Checkout.Session> {
  const { data: shop, error: shopError } = await input.supabase
    .from("shops")
    .select(
      "id, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_connect_charge_model",
    )
    .eq("id", input.shopId)
    .maybeSingle<ShopConnectRow>();
  if (shopError) throw new Error(shopError.message);
  if (!shop) throw new Error("Shop not found");

  const accountId = String(shop.stripe_account_id ?? "").trim();
  if (!accountId.startsWith("acct_")) {
    throw new Error("Shop is not connected to Stripe yet");
  }
  if (!shop.stripe_charges_enabled || !shop.stripe_payouts_enabled) {
    throw new Error("Stripe onboarding is not complete for this shop");
  }
  if (String(shop.stripe_connect_charge_model ?? "").trim() !== "direct") {
    throw new Error("Shop Stripe connection must be upgraded before accepting portal payments");
  }

  const settings = await getShopPaymentSettings(input.supabase, input.shopId);
  if (!settings.portal_payments_enabled) {
    throw new Error("Online payments are disabled for this shop");
  }

  const amountCents = Math.trunc(input.totalCents);
  if (!Number.isFinite(amountCents) || amountCents < settings.minimum_payment_cents) {
    throw new Error("This quote has no payable balance");
  }

  const currency = normalizeCurrency(input.currency || settings.default_currency);
  const applicationFeeAmount = Math.floor((amountCents * settings.platform_fee_bps) / 10_000);
  const operationKey = `${PORTAL_PARTS_QUOTE_PAYMENT_PURPOSE}:${input.requestId}:${amountCents}`;
  const metadata: Stripe.MetadataParam = {
    app: "profixiq",
    purpose: PORTAL_PARTS_QUOTE_PAYMENT_PURPOSE,
    shop_id: input.shopId,
    customer_id: input.customerId,
    parts_quote_request_id: input.requestId,
    operation_key: operationKey,
    connected_account_id: accountId,
    platform_fee_bps: String(settings.platform_fee_bps),
    platform_fee_cents: String(applicationFeeAmount),
    created_by: input.createdBy,
  };

  const params: CheckoutCreateParams = {
    mode: "payment",
    // Immediate methods only: the quote is marked paid from a completed,
    // paid session, so delayed methods (bank debits) are not offered.
    payment_method_types: ["card"],
    customer_email: input.customerEmail ?? undefined,
    client_reference_id: input.requestId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: amountCents,
          product_data: {
            name: "Parts quote payment",
            description: input.description.slice(0, 200),
          },
        },
      },
    ],
    payment_intent_data: {
      ...(applicationFeeAmount > 0 ? { application_fee_amount: applicationFeeAmount } : {}),
      ...(settings.receipt_email_enabled && input.customerEmail
        ? { receipt_email: input.customerEmail }
        : {}),
      metadata,
    },
    metadata,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    integration_identifier: `profixiq_partsquote_${randomBytes(4).toString("hex")}`,
  };

  return input.stripe.checkout.sessions.create(params, {
    stripeAccount: accountId,
    idempotencyKey: `profixiq:parts-quote-checkout:${input.shopId}:${input.requestId}:${amountCents}`,
  });
}
