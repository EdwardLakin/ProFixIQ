export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import { syncCanonicalShopBilling } from "@/features/stripe/lib/server/canonical-shop-billing";
import {
  getStripeCheckoutEmail,
  getStripeCheckoutPriceId,
  isCompletedStripeAcquisitionSession,
  readStripeAcquisitionMetadata,
  recordStripeAcquisitionCompletion,
  STRIPE_ACQUISITION_PURPOSE,
  toStripeId,
} from "@/features/stripe/lib/server/stripe-acquisition-intent";
import {
  getActiveInvoiceVersion,
  postPaymentEvent,
  type PaymentEventKind,
} from "@/features/invoices/server/financialLifecycle";
import {
  claimStripeWebhookEvent,
  completeStripeWebhookEvent,
  failStripeWebhookEvent,
} from "@/features/stripe/lib/server/stripe-webhook-receipts";
import { saveShopPaymentSettings } from "@/features/stripe/lib/server/shop-payment-settings";

type DB = Database;
type AdminClient = ReturnType<typeof createAdminSupabase>;
type WebhookContext = { event: Stripe.Event; stripe: Stripe; supabase: AdminClient };

type FinancialMetadata = {
  shopId: string;
  workOrderId: string;
  invoiceVersionId: string;
  actorUserId: string | null;
  operationKey: string;
};

type ShopConnectState = {
  id: string;
  stripe_onboarding_completed: boolean | null;
};

type ConnectController = {
  fees?: { payer?: string | null } | null;
  losses?: { payments?: string | null } | null;
  stripe_dashboard?: { type?: string | null } | null;
};

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

function normalizeCurrency(value: unknown): "CAD" | "USD" {
  return String(value ?? "").trim().toUpperCase() === "USD" ? "USD" : "CAD";
}

function connectedAccountId(event: Stripe.Event): string | null {
  const value = String(event.account ?? "").trim();
  return value.startsWith("acct_") ? value : null;
}

function requestOptions(event: Stripe.Event): Stripe.RequestOptions | undefined {
  const accountId = connectedAccountId(event);
  return accountId ? { stripeAccount: accountId } : undefined;
}

function metadataNumber(metadata: Stripe.Metadata | null | undefined, key: string): number {
  const value = Math.trunc(Number(metadata?.[key] ?? 0));
  return Number.isFinite(value) && value >= 0 ? value : 0;
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
    operationKey:
      String(metadata.operation_key ?? "").trim() || args.fallbackOperationKey,
  };
}

async function persistPayment(args: {
  supabase: AdminClient;
  session: Stripe.Checkout.Session;
  invoiceVersionId: string;
  connectedAccountId: string | null;
  paymentEventId?: string | null;
}): Promise<void> {
  const platformFeeCents = metadataNumber(
    args.session.metadata,
    "platform_fee_cents",
  );
  const amountCents = args.session.amount_total ?? 0;
  const payload = {
    shop_id: args.session.metadata?.shop_id ?? null,
    work_order_id: args.session.metadata?.work_order_id ?? null,
    customer_id: args.session.metadata?.customer_id ?? null,
    invoice_version_id: args.invoiceVersionId,
    payment_event_id: args.paymentEventId ?? null,
    stripe_session_id: args.session.id,
    stripe_checkout_session_id: args.session.id,
    stripe_payment_intent_id: toStripeId(args.session.payment_intent, "pi_"),
    stripe_connected_account_id: args.connectedAccountId,
    amount_cents: amountCents,
    amount: amountCents / 100,
    platform_fee_cents: platformFeeCents,
    currency: String(args.session.currency ?? "cad").toLowerCase(),
    status: "succeeded",
    paid_at: new Date().toISOString(),
    created_by: args.session.metadata?.created_by ?? null,
    metadata: {
      purpose: args.session.metadata?.purpose ?? "portal_invoice_payment",
      operation_key: args.session.metadata?.operation_key ?? null,
      charge_model: args.connectedAccountId ? "direct" : "platform",
    },
  } as unknown as DB["public"]["Tables"]["payments"]["Insert"];

  const { error } = await args.supabase
    .from("payments")
    .upsert(payload, { onConflict: "stripe_session_id" });
  if (error) throw new Error(`Stripe payment persistence failed: ${error.message}`);
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
  connectedAccountId?: string | null;
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
    metadata: {
      ...args.extra,
      stripe_operation_key: resolved.operationKey,
      stripe_connected_account_id: args.connectedAccountId ?? null,
      stripe_platform_fee_cents: metadataNumber(
        args.metadata,
        "platform_fee_cents",
      ),
    },
  });
}

function readController(account: Stripe.Account): ConnectController {
  return ((account as Stripe.Account & { controller?: ConnectController }).controller ?? {});
}

async function syncShopConnectFlagsByAccountId(args: {
  stripe: Stripe;
  supabase: AdminClient;
  accountId: string;
}) {
  const account = await args.stripe.accounts.retrieve(args.accountId);
  const { data: shops, error: shopLookupError } = await args.supabase
    .from("shops")
    .select("id, stripe_onboarding_completed")
    .eq("stripe_account_id", args.accountId)
    .limit(1);
  if (shopLookupError) throw new Error(shopLookupError.message);
  const shop = (shops?.[0] ?? null) as ShopConnectState | null;
  if (!shop) return;

  const controller = readController(account);
  const onboardingCompleted = Boolean(
    account.charges_enabled && account.payouts_enabled && account.details_submitted,
  );
  const { error } = await args.supabase
    .from("shops")
    .update({
      stripe_charges_enabled: Boolean(account.charges_enabled),
      stripe_payouts_enabled: Boolean(account.payouts_enabled),
      stripe_details_submitted: Boolean(account.details_submitted),
      stripe_onboarding_completed: onboardingCompleted,
      stripe_default_currency:
        String(account.default_currency ?? "").toLowerCase() === "usd" ? "usd" : "cad",
      stripe_connect_charge_model:
        controller.fees?.payer === "account" ? "direct" : "legacy",
      stripe_connect_dashboard_type:
        controller.stripe_dashboard?.type ?? null,
      stripe_connect_fees_collector:
        controller.fees?.payer === "account" ? "stripe" : "application",
      stripe_connect_losses_collector:
        controller.losses?.payments === "stripe" ? "stripe" : "application",
    } as DB["public"]["Tables"]["shops"]["Update"])
    .eq("id", shop.id);
  if (error) throw new Error(error.message);

  if (!shop.stripe_onboarding_completed && onboardingCompleted) {
    await saveShopPaymentSettings(args.supabase, shop.id, {
      portal_payments_enabled: true,
      default_currency:
        String(account.default_currency ?? "").toLowerCase() === "usd" ? "usd" : "cad",
    });
  }
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

async function recordAcquisitionCheckout(args: {
  event: Stripe.Event;
  session: Stripe.Checkout.Session;
  stripe: Stripe;
  supabase: AdminClient;
}): Promise<void> {
  const metadata = readStripeAcquisitionMetadata(args.session.metadata);
  if (!metadata || !isCompletedStripeAcquisitionSession(args.session)) {
    console.warn("[stripe/webhook] acquisition checkout failed identity validation", {
      eventId: args.event.id,
      sessionId: args.session.id,
    });
    return;
  }

  const [priceId, checkoutEmail] = await Promise.all([
    getStripeCheckoutPriceId(args.stripe, args.session.id),
    getStripeCheckoutEmail(args.stripe, args.session),
  ]);
  const customerId = toStripeId(args.session.customer, "cus_");
  const subscriptionId = toStripeId(args.session.subscription, "sub_");
  if (priceId !== metadata.priceId || !checkoutEmail || !customerId || !subscriptionId) {
    console.warn("[stripe/webhook] acquisition checkout artifacts did not match", {
      eventId: args.event.id,
      sessionId: args.session.id,
    });
    return;
  }

  const recorded = await recordStripeAcquisitionCompletion({
    admin: args.supabase,
    metadata,
    checkoutSessionId: args.session.id,
    customerId,
    subscriptionId,
    checkoutEmail,
    eventId: args.event.id,
    eventCreatedAt: new Date(args.event.created * 1000).toISOString(),
  });
  if (!recorded) {
    console.warn("[stripe/webhook] acquisition intent rejected completion", {
      eventId: args.event.id,
      sessionId: args.session.id,
    });
  }
}

async function linkVerifiedOwnerCheckout(args: {
  event: Stripe.Event;
  session: Stripe.Checkout.Session;
  stripe: Stripe;
  supabase: AdminClient;
}): Promise<void> {
  if (
    args.session.status !== "complete" ||
    (args.session.payment_status !== "paid" &&
      args.session.payment_status !== "no_payment_required")
  ) {
    return;
  }

  const userId = String(args.session.metadata?.supabase_user_id ?? "").trim();
  const shopId = String(args.session.metadata?.shop_id ?? "").trim();
  const customerId = toStripeId(args.session.customer, "cus_");
  const subscriptionId = toStripeId(args.session.subscription, "sub_");
  if (!isUuid(userId) || !isUuid(shopId) || !customerId || !subscriptionId) return;

  const [{ data: profile, error: profileError }, { data: shop, error: shopError }] =
    await Promise.all([
      args.supabase
        .from("profiles")
        .select("id, shop_id, role")
        .eq("id", userId)
        .maybeSingle<{ id: string; shop_id: string | null; role: string | null }>(),
      args.supabase
        .from("shops")
        .select("id, stripe_customer_id")
        .eq("id", shopId)
        .maybeSingle<{ id: string; stripe_customer_id: string | null }>(),
    ]);

  const role = String(profile?.role ?? "").trim().toLowerCase();
  if (
    profileError ||
    shopError ||
    !profile ||
    !shop ||
    profile.shop_id !== shopId ||
    (role !== "owner" && role !== "admin") ||
    shop.stripe_customer_id !== customerId
  ) {
    console.warn("[stripe/webhook] owner checkout no longer matches billing authority", {
      eventId: args.event.id,
      sessionId: args.session.id,
    });
    return;
  }

  const [{ error: profileUpdateError }, { error: shopUpdateError }] = await Promise.all([
    args.supabase
      .from("profiles")
      .update({
        stripe_checkout_complete: true,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_checkout_session_id: args.session.id,
      } as unknown as DB["public"]["Tables"]["profiles"]["Update"])
      .eq("id", userId)
      .eq("shop_id", shopId),
    args.supabase
      .from("shops")
      .update({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_checkout_session_id: args.session.id,
        stripe_billing_sync_required: true,
      } as unknown as DB["public"]["Tables"]["shops"]["Update"])
      .eq("id", shopId)
      .eq("stripe_customer_id", customerId),
  ]);
  if (profileUpdateError || shopUpdateError) {
    throw new Error(
      `owner checkout persistence failed (${profileUpdateError?.code ?? shopUpdateError?.code ?? "unknown"})`,
    );
  }

  await syncCanonicalShopBilling({
    stripe: args.stripe,
    supabase: args.supabase,
    shopId,
    customerId,
    subscriptionId,
    checkoutSessionId: args.session.id,
  });
}

async function syncSubscriptionFromInvoice(ctx: WebhookContext, invoice: Stripe.Invoice) {
  if (connectedAccountId(ctx.event)) return;
  const subscriptionId = toStripeId(invoice.subscription, "sub_");
  const customerId = toStripeId(invoice.customer, "cus_");
  if (!subscriptionId || !customerId) return;
  const subscription = await ctx.stripe.subscriptions.retrieve(subscriptionId);
  const shopId = await resolveShopIdForSubscription({
    stripe: ctx.stripe,
    supabase: ctx.supabase,
    subscription,
    customerId,
  });
  if (!shopId) return;
  await syncCanonicalShopBilling({
    stripe: ctx.stripe,
    supabase: ctx.supabase,
    shopId,
    customerId,
    subscriptionId,
    webhookEvent: {
      id: ctx.event.id,
      createdAt: new Date(ctx.event.created * 1000).toISOString(),
    },
  });
}

async function processStripeWebhookEvent(ctx: WebhookContext): Promise<void> {
  const { event, stripe, supabase } = ctx;
  const accountId = connectedAccountId(event);
  const options = requestOptions(event);

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
          paymentMethod: accountId ? "stripe_direct" : "stripe",
          occurredAt: event.created,
          connectedAccountId: accountId,
          extra: { stripe_session_id: session.id },
        });
        const invoiceVersionId = String(session.metadata?.invoice_version_id ?? "").trim();
        if (isUuid(invoiceVersionId)) {
          const paymentEvent = result?.payment_event as { id?: unknown } | undefined;
          await persistPayment({
            supabase,
            session,
            invoiceVersionId,
            connectedAccountId: accountId,
            paymentEventId:
              typeof paymentEvent?.id === "string" ? paymentEvent.id : null,
          });
        }
        return;
      }

      if (session.mode === "subscription" && !accountId) {
        const purpose = String(session.metadata?.purpose ?? "").trim();
        if (purpose === STRIPE_ACQUISITION_PURPOSE) {
          await recordAcquisitionCheckout({ event, session, stripe, supabase });
        } else if (purpose === "profixiq_subscription") {
          await linkVerifiedOwnerCheckout({ event, session, stripe, supabase });
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
        paymentMethod: accountId ? "stripe_direct" : "stripe",
        occurredAt: event.created,
        connectedAccountId: accountId,
        extra: { failure_message: intent.last_payment_error?.message ?? null },
      });
      return;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const intentId = toStripeId(charge.payment_intent, "pi_");
      const intent = intentId
        ? await stripe.paymentIntents.retrieve(intentId, options)
        : null;
      await postStripeFinancialEvent({
        supabase,
        metadata: intent?.metadata,
        eventKind: "refund_succeeded",
        amountCents: charge.amount_refunded,
        currency: charge.currency,
        eventId: event.id,
        paymentId: intentId ?? charge.id,
        paymentMethod: charge.payment_method_details?.type ?? "stripe",
        occurredAt: event.created,
        connectedAccountId: accountId,
        extra: { stripe_charge_id: charge.id },
      });
      return;
    }

    case "charge.dispute.created":
    case "charge.dispute.closed": {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = toStripeId(dispute.charge, "ch_");
      if (!chargeId) return;
      const charge = await stripe.charges.retrieve(chargeId, options);
      const intentId = toStripeId(charge.payment_intent, "pi_");
      const intent = intentId
        ? await stripe.paymentIntents.retrieve(intentId, options)
        : null;
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
        paymentMethod: charge.payment_method_details?.type ?? "stripe",
        occurredAt: event.created,
        connectedAccountId: accountId,
        extra: { dispute_id: dispute.id, dispute_status: dispute.status },
      });
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      if (accountId) return;
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = toStripeId(subscription.customer, "cus_");
      if (!customerId) return;
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
        webhookEvent: {
          id: event.id,
          createdAt: new Date(event.created * 1000).toISOString(),
        },
      });
      return;
    }

    case "invoice.paid":
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      await syncSubscriptionFromInvoice(ctx, event.data.object as Stripe.Invoice);
      return;
    }

    default:
      return;
  }
}

export async function handleStripeWebhook(req: Request): Promise<Response> {
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  if (!endpointSecret || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Missing Stripe webhook configuration" },
      { status: 500 },
    );
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  const stripe = createStripeClient(process.env.STRIPE_SECRET_KEY);
  const supabase = createAdminSupabase();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, endpointSecret);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  let claimToken: string | null = null;
  try {
    const claim = await claimStripeWebhookEvent({ supabase, event });
    if (!claim.claimed) {
      if (claim.inProgress) {
        return NextResponse.json(
          { received: false, retry: true },
          { status: 409, headers: { "Retry-After": "300" } },
        );
      }
      return NextResponse.json(
        { received: true, duplicate: claim.alreadyProcessed },
        { status: 200 },
      );
    }
    if (!claim.claimToken) throw new Error("Stripe webhook claim token missing");

    claimToken = claim.claimToken;
    await processStripeWebhookEvent({ event, stripe, supabase });
    await completeStripeWebhookEvent({
      supabase,
      eventId: event.id,
      claimToken,
    });
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[stripe/webhook] processing error:", message);
    if (claimToken) {
      try {
        await failStripeWebhookEvent({
          supabase,
          eventId: event.id,
          claimToken,
          error,
        });
      } catch (receiptError) {
        console.error(
          "[stripe/webhook] failure receipt error:",
          receiptError instanceof Error ? receiptError.message : "Unknown error",
        );
      }
    }
    return NextResponse.json({ error: "Webhook handler failure" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handleStripeWebhook(req);
}
