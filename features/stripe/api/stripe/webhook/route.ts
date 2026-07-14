export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { syncCanonicalShopBilling } from "@/features/stripe/lib/server/canonical-shop-billing";
import {
  getActiveInvoiceVersion,
  postPaymentEvent,
  type PaymentEventKind,
} from "@/features/invoices/server/financialLifecycle";

type DB = Database;
type AdminClient = ReturnType<typeof createClient<DB>>;
type WebhookContext = { event: Stripe.Event; stripe: Stripe; supabase: AdminClient };

type FinancialMetadata = {
  shopId: string;
  workOrderId: string;
  invoiceVersionId: string;
  actorUserId: string | null;
  operationKey: string;
};

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

function toStripeId(value: unknown, prefix: string): string | null {
  if (typeof value === "string" && value.startsWith(prefix)) return value;
  if (value && typeof value === "object") {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.startsWith(prefix)) return id;
  }
  return null;
}

function normalizeCurrency(value: unknown): "CAD" | "USD" {
  return String(value ?? "").trim().toUpperCase() === "CAD" ? "CAD" : "USD";
}

async function resolveFinancialMetadata(args: {
  supabase: AdminClient;
  metadata?: Stripe.Metadata | null;
  fallbackOperationKey: string;
}): Promise<FinancialMetadata | null> {
  const metadata = args.metadata ?? {};
  const shopId = String(metadata.shop_id ?? "").trim();
  const workOrderId = String(metadata.work_order_id ?? "").trim();
  let invoiceVersionId = String(metadata.invoice_version_id ?? "").trim();
  if (!isUuid(shopId) || !isUuid(workOrderId)) return null;

  if (!isUuid(invoiceVersionId)) {
    const active = await getActiveInvoiceVersion({
      supabase: args.supabase,
      shopId,
      workOrderId,
    });
    invoiceVersionId = active?.id ?? "";
  }
  if (!isUuid(invoiceVersionId)) return null;

  const actor = String(metadata.created_by ?? "").trim();
  return {
    shopId,
    workOrderId,
    invoiceVersionId,
    actorUserId: isUuid(actor) ? actor : null,
    operationKey: String(metadata.operation_key ?? "").trim() || args.fallbackOperationKey,
  };
}

async function persistLegacyPayment(args: {
  supabase: AdminClient;
  session: Stripe.Checkout.Session;
  invoiceVersionId: string;
  paymentEventId?: string | null;
}): Promise<void> {
  const payload = {
    shop_id: args.session.metadata?.shop_id ?? null,
    work_order_id: args.session.metadata?.work_order_id ?? null,
    invoice_version_id: args.invoiceVersionId,
    payment_event_id: args.paymentEventId ?? null,
    stripe_session_id: args.session.id,
    stripe_payment_intent_id: toStripeId(args.session.payment_intent, "pi_"),
    amount_cents: args.session.amount_total ?? 0,
    currency: String(args.session.currency ?? "usd").toLowerCase(),
    status: "succeeded",
    paid_at: new Date().toISOString(),
    metadata: {
      purpose: args.session.metadata?.purpose ?? "portal_invoice_payment",
      operation_key: args.session.metadata?.operation_key ?? null,
    },
  } as unknown as DB["public"]["Tables"]["payments"]["Insert"];

  const { error } = await args.supabase
    .from("payments")
    .upsert(payload, { onConflict: "stripe_session_id" });
  if (error) console.error("[stripe/webhook] legacy payment persistence failed:", error.message);
}

async function postStripeFinancialEvent(args: {
  supabase: AdminClient;
  metadata?: Stripe.Metadata | null;
  eventKind: PaymentEventKind;
  amountCents: number;
  currency: string | null;
  eventId: string;
  paymentId?: string | null;
  paymentMethod?: string | null;
  occurredAt?: number | null;
  extra?: Record<string, unknown>;
}) {
  const resolved = await resolveFinancialMetadata({
    supabase: args.supabase,
    metadata: args.metadata,
    fallbackOperationKey: `stripe:${args.eventId}`,
  });
  if (!resolved) {
    console.warn("[stripe/webhook] financial event missing canonical invoice metadata", {
      eventId: args.eventId,
      eventKind: args.eventKind,
    });
    return null;
  }

  return postPaymentEvent({
    supabase: args.supabase,
    shopId: resolved.shopId,
    workOrderId: resolved.workOrderId,
    invoiceVersionId: resolved.invoiceVersionId,
    eventKind: args.eventKind,
    amount: Math.max(0, args.amountCents) / 100,
    currency: normalizeCurrency(args.currency),
    paymentMethod: args.paymentMethod ?? null,
    processor: "stripe",
    processorEventId: args.eventId,
    processorPaymentId: args.paymentId ?? null,
    operationKey: `stripe:${args.eventId}`,
    actorUserId: resolved.actorUserId,
    occurredAt: args.occurredAt
      ? new Date(args.occurredAt * 1000).toISOString()
      : new Date().toISOString(),
    metadata: { ...args.extra, stripe_operation_key: resolved.operationKey },
  });
}

async function syncShopConnectFlagsByAccountId(args: {
  stripe: Stripe;
  supabase: AdminClient;
  accountId: string;
}) {
  const account = await args.stripe.accounts.retrieve(args.accountId);
  const { data: shops } = await args.supabase
    .from("shops")
    .select("id")
    .eq("stripe_account_id", args.accountId)
    .limit(1);
  const shopId = shops?.[0]?.id;
  if (!shopId) return;
  const { error } = await args.supabase
    .from("shops")
    .update({
      stripe_charges_enabled: Boolean(account.charges_enabled),
      stripe_payouts_enabled: Boolean(account.payouts_enabled),
      stripe_details_submitted: Boolean(account.details_submitted),
      stripe_onboarding_completed: Boolean(
        account.charges_enabled && account.payouts_enabled && account.details_submitted,
      ),
    } as DB["public"]["Tables"]["shops"]["Update"])
    .eq("id", shopId);
  if (error) console.error("[stripe/webhook] connect flag sync failed:", error.message);
}

async function resolveShopIdForSubscription(args: {
  stripe: Stripe;
  supabase: AdminClient;
  subscription: Stripe.Subscription;
  customerId: string | null;
}): Promise<string | null> {
  const metadataShopId = String(args.subscription.metadata?.shop_id ?? "").trim();
  if (isUuid(metadataShopId)) return metadataShopId;

  if (args.customerId) {
    const { data: shops } = await args.supabase
      .from("shops")
      .select("id")
      .eq("stripe_customer_id", args.customerId)
      .limit(2);
    if (shops?.length === 1 && shops[0]?.id) return shops[0].id;

    const customer = await args.stripe.customers.retrieve(args.customerId);
    const userId =
      customer && !("deleted" in customer && customer.deleted)
        ? String(customer.metadata?.supabase_user_id ?? "").trim()
        : "";
    if (isUuid(userId)) {
      const { data: profile } = await args.supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", userId)
        .maybeSingle<{ shop_id: string | null }>();
      if (isUuid(profile?.shop_id)) return profile.shop_id;
    }
  }
  return null;
}

async function processStripeWebhookEvent(ctx: WebhookContext): Promise<void> {
  const { event, stripe, supabase } = ctx;

  switch (event.type) {
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      await syncShopConnectFlagsByAccountId({ stripe, supabase, accountId: account.id });
      return;
    }

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "payment") {
        const result = await postStripeFinancialEvent({
          supabase,
          metadata: session.metadata,
          eventKind: "payment_succeeded",
          amountCents: session.amount_total ?? 0,
          currency: session.currency,
          eventId: event.id,
          paymentId: toStripeId(session.payment_intent, "pi_"),
          paymentMethod: "card",
          occurredAt: event.created,
          extra: { stripe_session_id: session.id },
        });
        const invoiceVersionId = String(session.metadata?.invoice_version_id ?? "").trim();
        if (isUuid(invoiceVersionId)) {
          const paymentEvent = result?.payment_event as { id?: unknown } | undefined;
          await persistLegacyPayment({
            supabase,
            session,
            invoiceVersionId,
            paymentEventId: typeof paymentEvent?.id === "string" ? paymentEvent.id : null,
          });
        }
        return;
      }

      if (session.mode === "subscription") {
        const userId =
          session.metadata?.supabase_user_id ??
          session.metadata?.supabaseUserId ??
          (isUuid(session.client_reference_id) ? session.client_reference_id : null);
        const customerId = toStripeId(session.customer, "cus_");
        const subscriptionId = toStripeId(session.subscription, "sub_");
        const shopId = String(session.metadata?.shop_id ?? "").trim();

        if (isUuid(userId)) {
          await supabase
            .from("profiles")
            .update({
              stripe_checkout_complete: true,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              stripe_checkout_session_id: session.id,
            } as unknown as DB["public"]["Tables"]["profiles"]["Update"])
            .eq("id", userId);
        }

        if (isUuid(shopId)) {
          await supabase
            .from("shops")
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              stripe_checkout_session_id: session.id,
            } as unknown as DB["public"]["Tables"]["shops"]["Update"])
            .eq("id", shopId);
          if (subscriptionId) {
            await syncCanonicalShopBilling({
              stripe,
              supabase,
              shopId,
              customerId,
              subscriptionId,
              checkoutSessionId: session.id,
            });
          }
        }
      }
      return;
    }

    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      await postStripeFinancialEvent({
        supabase,
        metadata: intent.metadata,
        eventKind: "payment_failed",
        amountCents: intent.amount,
        currency: intent.currency,
        eventId: event.id,
        paymentId: intent.id,
        paymentMethod: "card",
        occurredAt: event.created,
        extra: { failure_message: intent.last_payment_error?.message ?? null },
      });
      return;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const intentId = toStripeId(charge.payment_intent, "pi_");
      const intent = intentId ? await stripe.paymentIntents.retrieve(intentId) : null;
      await postStripeFinancialEvent({
        supabase,
        metadata: intent?.metadata,
        eventKind: "refund_succeeded",
        amountCents: charge.amount_refunded,
        currency: charge.currency,
        eventId: event.id,
        paymentId: intentId ?? charge.id,
        paymentMethod: charge.payment_method_details?.type ?? "card",
        occurredAt: event.created,
        extra: { stripe_charge_id: charge.id },
      });
      return;
    }

    case "charge.dispute.created":
    case "charge.dispute.closed": {
      const dispute = event.data.object as Stripe.Dispute;
      const charge = await stripe.charges.retrieve(toStripeId(dispute.charge, "ch_") ?? "");
      const intentId = toStripeId(charge.payment_intent, "pi_");
      const intent = intentId ? await stripe.paymentIntents.retrieve(intentId) : null;
      const kind: PaymentEventKind =
        event.type === "charge.dispute.created"
          ? "dispute_opened"
          : dispute.status === "won"
            ? "dispute_won"
            : "dispute_lost";
      await postStripeFinancialEvent({
        supabase,
        metadata: intent?.metadata,
        eventKind: kind,
        amountCents: dispute.amount,
        currency: dispute.currency,
        eventId: event.id,
        paymentId: intentId ?? dispute.id,
        paymentMethod: charge.payment_method_details?.type ?? "card",
        occurredAt: event.created,
        extra: { dispute_id: dispute.id, dispute_status: dispute.status },
      });
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = toStripeId(subscription.customer, "cus_");
      const shopId = await resolveShopIdForSubscription({
        stripe,
        supabase,
        subscription,
        customerId,
      });
      if (!shopId) return;
      await syncCanonicalShopBilling({
        stripe,
        supabase,
        shopId,
        customerId,
        subscriptionId: subscription.id,
      });
      return;
    }

    default:
      return;
  }
}

export async function handleStripeWebhook(req: Request): Promise<Response> {
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  if (!endpointSecret || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Missing Stripe webhook configuration" }, { status: 500 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });

  const stripe = createStripeClient(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient<DB>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, endpointSecret);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  try {
    await processStripeWebhookEvent({ event, stripe, supabase });
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[stripe/webhook] processing error:", message);
    return NextResponse.json({ error: "Webhook handler failure" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handleStripeWebhook(req);
}
