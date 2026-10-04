import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type RpcClient = SupabaseClient<DB> & {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

export type PartsQuoteStripeEventKind =
  | "refund_succeeded"
  | "dispute_opened"
  | "dispute_won"
  | "dispute_lost";

/**
 * Applies a Stripe refund or dispute event to a customer parts quote payment.
 * Returns `handled: false` when the charge does not belong to a parts quote so
 * the caller continues with the existing invoice handling. Database failures
 * throw so Stripe retries the delivery.
 */
export async function recordPortalPartsQuoteStripeEvent(args: {
  supabase: SupabaseClient<DB>;
  paymentIntentId: string | null;
  eventKind: PartsQuoteStripeEventKind;
  amountCents: number;
  eventId: string;
  occurredAtSeconds?: number | null;
  /** parts_quote_request_id from the charge metadata, for events that arrive before the payment was recorded. */
  requestId?: string | null;
  /** Connected account the event came from; checked against the quote's shop. */
  connectedAccountId?: string | null;
}): Promise<{ handled: boolean }> {
  const paymentIntentId = args.paymentIntentId?.trim() ?? "";
  const requestId = args.requestId?.trim() ?? "";
  if (!paymentIntentId && !requestId) return { handled: false };

  const { data, error } = await (args.supabase as RpcClient).rpc(
    "record_portal_parts_quote_payment_event",
    {
      p_payment_intent_id: paymentIntentId || null,
      p_event_kind: args.eventKind,
      p_amount_cents: Math.max(0, Math.trunc(args.amountCents || 0)),
      p_processor_event_id: args.eventId,
      p_at: new Date(
        (args.occurredAtSeconds ?? Math.floor(Date.now() / 1000)) * 1000,
      ).toISOString(),
      p_request_id: args.requestId?.trim() || null,
      p_connected_account_id: args.connectedAccountId?.trim() || null,
    },
  );
  if (error) throw new Error(error.message);

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.handled !== true) return { handled: false };
  // The quote state is saved, but the invoice mirror was rejected: fail the
  // webhook so Stripe redelivers and the idempotent reconcile retries it.
  if (result.ledgerIssue === true) {
    throw new Error(
      `Parts quote payment event ${args.eventId} could not be mirrored to the invoice: ${
        typeof result.ledgerError === "string" ? result.ledgerError : "ledger issue"
      }`,
    );
  }
  return { handled: true };
}
