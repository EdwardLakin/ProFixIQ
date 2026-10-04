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
}): Promise<{ handled: boolean }> {
  const paymentIntentId = args.paymentIntentId?.trim() ?? "";
  if (!paymentIntentId) return { handled: false };

  const { data, error } = await (args.supabase as RpcClient).rpc(
    "record_portal_parts_quote_payment_event",
    {
      p_payment_intent_id: paymentIntentId,
      p_event_kind: args.eventKind,
      p_amount_cents: Math.max(0, Math.trunc(args.amountCents || 0)),
      p_processor_event_id: args.eventId,
      p_at: new Date(
        (args.occurredAtSeconds ?? Math.floor(Date.now() / 1000)) * 1000,
      ).toISOString(),
    },
  );
  if (error) throw new Error(error.message);

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.handled !== true) return { handled: false };
  if (typeof result.ledgerError === "string" && result.ledgerError) {
    console.error("[portal/parts-quote-payment] invoice ledger rejected a payment event", {
      eventId: args.eventId,
      error: result.ledgerError,
    });
  }
  return { handled: true };
}
