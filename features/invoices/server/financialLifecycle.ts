import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import type { InvoiceSnapshot } from "@/features/invoices/server/getInvoiceSnapshot";

type DB = Database;
type RpcClient = SupabaseClient<DB> & {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

type DynamicQuery = {
  eq(column: string, value: string): DynamicQuery;
  in(column: string, values: string[]): DynamicQuery;
  order(column: string, options: { ascending: boolean }): DynamicQuery;
  limit(value: number): DynamicQuery;
  maybeSingle<T>(): Promise<{ data: T | null; error: { message: string } | null }>;
};

type DynamicClient = {
  from(table: string): {
    select(columns: string): DynamicQuery;
  };
};

export type InvoiceVersionLifecycleStatus =
  | "draft"
  | "issued"
  | "partially_paid"
  | "paid"
  | "voided"
  | "superseded"
  | "credited";

export type InvoiceVersionRecord = {
  id: string;
  shop_id: string;
  work_order_id: string;
  invoice_id: string | null;
  version_number: number;
  lifecycle_status: InvoiceVersionLifecycleStatus;
  currency: "CAD" | "USD";
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  paid_total: number;
  refunded_total: number;
  outstanding_total: number;
  snapshot: InvoiceSnapshot;
  issued_at: string | null;
};

export type PaymentEventKind =
  | "payment_succeeded"
  | "payment_failed"
  | "refund_succeeded"
  | "refund_failed"
  | "dispute_opened"
  | "dispute_won"
  | "dispute_lost"
  | "manual_payment"
  | "manual_reversal";

export type PaymentPostResult = {
  payment_event: Record<string, unknown>;
  invoice_version: InvoiceVersionRecord;
  receipt: Record<string, unknown> | null;
};

function asRpcClient(supabase: SupabaseClient<DB>): RpcClient {
  return supabase as RpcClient;
}

export async function finalizeInvoiceVersion(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  workOrderId: string;
  invoiceId: string;
  snapshot: InvoiceSnapshot;
  actorUserId: string;
  operationKey: string;
}): Promise<InvoiceVersionRecord> {
  const { snapshot } = args;
  const { data, error } = await asRpcClient(args.supabase).rpc("finalize_invoice_version", {
    p_shop_id: args.shopId,
    p_work_order_id: args.workOrderId,
    p_invoice_id: args.invoiceId,
    p_snapshot: snapshot,
    p_currency: snapshot.currency,
    p_subtotal: snapshot.subtotal ?? 0,
    p_discount_total: snapshot.discountTotal ?? 0,
    p_tax_total: snapshot.taxTotal ?? 0,
    p_total: snapshot.total ?? 0,
    p_actor_user_id: args.actorUserId,
    p_operation_key: args.operationKey,
  });
  if (error) throw new Error(error.message);
  return data as InvoiceVersionRecord;
}

export async function postPaymentEvent(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  workOrderId: string;
  invoiceVersionId: string;
  eventKind: PaymentEventKind;
  amount: number;
  currency: "CAD" | "USD";
  paymentMethod?: string | null;
  processor: string;
  processorEventId?: string | null;
  processorPaymentId?: string | null;
  operationKey: string;
  actorUserId?: string | null;
  occurredAt?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<PaymentPostResult> {
  const { data, error } = await asRpcClient(args.supabase).rpc("post_payment_event", {
    p_shop_id: args.shopId,
    p_work_order_id: args.workOrderId,
    p_invoice_version_id: args.invoiceVersionId,
    p_event_kind: args.eventKind,
    p_amount: args.amount,
    p_currency: args.currency,
    p_payment_method: args.paymentMethod ?? null,
    p_processor: args.processor,
    p_processor_event_id: args.processorEventId ?? null,
    p_processor_payment_id: args.processorPaymentId ?? null,
    p_operation_key: args.operationKey,
    p_actor_user_id: args.actorUserId ?? null,
    p_occurred_at: args.occurredAt ?? new Date().toISOString(),
    p_metadata: args.metadata ?? {},
  });
  if (error) throw new Error(error.message);
  return data as PaymentPostResult;
}

export async function getActiveInvoiceVersion(args: {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
  shopId?: string;
}): Promise<InvoiceVersionRecord | null> {
  const client = args.supabase as unknown as DynamicClient;
  let query = client
    .from("invoice_versions")
    .select(
      "id,shop_id,work_order_id,invoice_id,version_number,lifecycle_status,currency,subtotal,discount_total,tax_total,total,paid_total,refunded_total,outstanding_total,snapshot,issued_at",
    )
    .eq("work_order_id", args.workOrderId);

  if (args.shopId) query = query.eq("shop_id", args.shopId);
  query = query
    .in("lifecycle_status", ["issued", "partially_paid", "paid"])
    .order("version_number", { ascending: false })
    .limit(1);

  const { data, error } = await query.maybeSingle<InvoiceVersionRecord>();
  if (error) throw new Error(error.message);
  return data;
}
