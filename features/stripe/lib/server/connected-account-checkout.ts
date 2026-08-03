import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { getShopPaymentSettings } from "@/features/stripe/lib/server/shop-payment-settings";

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

export type ConnectedAccountCheckoutInput = {
  stripe: Stripe;
  supabase: SupabaseClient<DB>;
  shopId: string;
  workOrderId: string;
  invoiceVersionId: string;
  invoiceVersionNumber: number | string;
  outstandingAmount: number;
  currency: string;
  customerEmail?: string | null;
  customerId?: string | null;
  createdBy?: string | null;
  purpose: "portal_invoice_payment" | "staff_invoice_payment";
  successUrl: string;
  cancelUrl: string;
};

function integrationIdentifier(): string {
  return `profixiq_invoice_${randomBytes(4).toString("hex")}`;
}

function normalizeCurrency(value: string): "cad" | "usd" {
  return value.trim().toLowerCase() === "usd" ? "usd" : "cad";
}

export async function createConnectedAccountInvoiceCheckout(
  input: ConnectedAccountCheckoutInput,
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
    throw new Error("Online invoice payments are disabled for this shop");
  }

  const amountCents = Math.round(Number(input.outstandingAmount) * 100);
  if (!Number.isFinite(amountCents) || amountCents < settings.minimum_payment_cents) {
    throw new Error("This invoice has no payable outstanding balance");
  }

  const currency = normalizeCurrency(input.currency || settings.default_currency);
  const applicationFeeAmount = Math.floor(
    (amountCents * settings.platform_fee_bps) / 10_000,
  );
  const operationKey = `${input.purpose}:${input.invoiceVersionId}:${amountCents}`;
  const metadata: Stripe.MetadataParam = {
    app: "profixiq",
    shop_id: input.shopId,
    work_order_id: input.workOrderId,
    invoice_version_id: input.invoiceVersionId,
    operation_key: operationKey,
    purpose: input.purpose,
    connected_account_id: accountId,
    platform_fee_bps: String(settings.platform_fee_bps),
    platform_fee_cents: String(applicationFeeAmount),
    ...(input.customerId ? { customer_id: input.customerId } : {}),
    ...(input.createdBy ? { created_by: input.createdBy } : {}),
  };

  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
    ...(applicationFeeAmount > 0
      ? { application_fee_amount: applicationFeeAmount }
      : {}),
    ...(settings.receipt_email_enabled && input.customerEmail
      ? { receipt_email: input.customerEmail }
      : {}),
    metadata,
  };

  const params: CheckoutCreateParams = {
    mode: "payment",
    customer_email: input.customerEmail ?? undefined,
    client_reference_id: input.invoiceVersionId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: amountCents,
          product_data: {
            name: `Invoice ${input.invoiceVersionNumber} payment`,
            description: `Work order ${input.workOrderId.slice(0, 8)}`,
          },
        },
      },
    ],
    payment_intent_data: paymentIntentData,
    metadata,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    integration_identifier: integrationIdentifier(),
  };

  return input.stripe.checkout.sessions.create(params, {
    stripeAccount: accountId,
    idempotencyKey: `profixiq:direct-checkout:${input.shopId}:${input.invoiceVersionId}:${amountCents}`,
  });
}
