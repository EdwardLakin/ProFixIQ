import "server-only";

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { PORTAL_PARTS_QUOTE_PAYMENT_PURPOSE } from "@/features/portal/lib/partsQuotePresentation";

type DB = Database;
type RpcClient = SupabaseClient<DB> & {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripeId(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null;
  const id = typeof value === "string" ? value : value.id;
  return id ? id : null;
}

export function isPortalPartsQuoteSession(session: Stripe.Checkout.Session): boolean {
  return text(session.metadata?.purpose) === PORTAL_PARTS_QUOTE_PAYMENT_PURPOSE;
}

export type RecordPartsQuotePaymentResult = {
  recorded: boolean;
  reason?: string;
};

/**
 * Idempotently records a paid connected-account Checkout Session against its
 * parts quote. Called by the Stripe webhook and by the customer's return from
 * Checkout. Permanent mismatches return `recorded: false` instead of throwing
 * so Stripe does not retry them forever; database failures throw so they do.
 */
export async function recordPortalPartsQuoteCheckoutSession(args: {
  supabase: SupabaseClient<DB>;
  session: Stripe.Checkout.Session;
  connectedAccountId: string | null;
}): Promise<RecordPartsQuotePaymentResult> {
  const { supabase, session } = args;
  if (!isPortalPartsQuoteSession(session)) {
    return { recorded: false, reason: "not_parts_quote_session" };
  }
  if (session.mode !== "payment" || session.payment_status !== "paid") {
    return { recorded: false, reason: "not_paid" };
  }

  const requestId = text(session.metadata?.parts_quote_request_id);
  const shopId = text(session.metadata?.shop_id);
  const customerId = text(session.metadata?.customer_id);
  if (!UUID_PATTERN.test(requestId) || !UUID_PATTERN.test(shopId) || !UUID_PATTERN.test(customerId)) {
    console.warn("[portal/parts-quote-payment] session missing canonical metadata", {
      sessionId: session.id,
    });
    return { recorded: false, reason: "missing_metadata" };
  }

  const { data: request, error: requestError } = await supabase
    .from("portal_parts_quote_requests")
    .select("id, shop_id, customer_id")
    .eq("id", requestId)
    .maybeSingle();
  if (requestError) throw new Error(requestError.message);
  if (!request || request.shop_id !== shopId || request.customer_id !== customerId) {
    console.warn("[portal/parts-quote-payment] session does not match a quote", {
      sessionId: session.id,
    });
    return { recorded: false, reason: "request_mismatch" };
  }

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("stripe_account_id")
    .eq("id", shopId)
    .maybeSingle();
  if (shopError) throw new Error(shopError.message);
  const shopAccount = text(shop?.stripe_account_id);
  if (!shopAccount || (args.connectedAccountId && args.connectedAccountId !== shopAccount)) {
    console.warn("[portal/parts-quote-payment] connected account mismatch", {
      sessionId: session.id,
    });
    return { recorded: false, reason: "account_mismatch" };
  }

  const { data, error } = await (supabase as RpcClient).rpc(
    "record_portal_parts_quote_request_payment",
    {
      p_request_id: requestId,
      p_session_id: session.id,
      p_payment_intent_id: stripeId(session.payment_intent as string | { id?: string } | null),
      p_amount_cents: session.amount_total ?? 0,
      p_connected_account_id: shopAccount,
      p_at: new Date().toISOString(),
    },
  );
  if (error) throw new Error(error.message);

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.ok !== true) {
    console.error("[portal/parts-quote-payment] payment could not be recorded", {
      sessionId: session.id,
      error: result.error ?? "unknown",
    });
    return { recorded: false, reason: String(result.error ?? "rejected") };
  }
  if (result.duplicate === true) {
    console.error("[portal/parts-quote-payment] duplicate payment for an already-paid quote", {
      sessionId: session.id,
      requestId,
    });
  }
  return { recorded: true };
}
