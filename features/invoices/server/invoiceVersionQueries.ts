import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import type { InvoiceSnapshot } from "@/features/invoices/server/getInvoiceSnapshot";
import type { InvoiceVersionLifecycleStatus } from "@/features/invoices/server/financialLifecycle";

type DB = Database;

type InvoiceVersionView = {
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
  created_at: string;
};

type DynamicQuery = {
  eq(column: string, value: string): DynamicQuery;
  in(column: string, values: string[]): DynamicQuery;
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): DynamicQuery;
  limit(value: number): DynamicQuery;
  maybeSingle<T>(): Promise<{ data: T | null; error: { message: string } | null }>;
  returns<T>(): Promise<{ data: T | null; error: { message: string } | null }>;
};

type DynamicClient = {
  from(table: string): { select(columns: string): DynamicQuery };
};

const SELECT_COLUMNS =
  "id,shop_id,work_order_id,invoice_id,version_number,lifecycle_status,currency,subtotal,discount_total,tax_total,total,paid_total,refunded_total,outstanding_total,snapshot,issued_at,created_at";

export const CUSTOMER_VISIBLE_INVOICE_STATES: InvoiceVersionLifecycleStatus[] = [
  "issued",
  "partially_paid",
  "paid",
  "voided",
  "superseded",
  "credited",
];

export async function getInvoiceVersionById(args: {
  supabase: SupabaseClient<DB>;
  invoiceVersionId: string;
  shopId?: string;
  workOrderId?: string;
}): Promise<InvoiceVersionView | null> {
  const client = args.supabase as unknown as DynamicClient;
  let query = client
    .from("invoice_versions")
    .select(SELECT_COLUMNS)
    .eq("id", args.invoiceVersionId);
  if (args.shopId) query = query.eq("shop_id", args.shopId);
  if (args.workOrderId) query = query.eq("work_order_id", args.workOrderId);
  const { data, error } = await query.maybeSingle<InvoiceVersionView>();
  if (error) throw new Error(error.message);
  return data;
}

export async function getLatestCustomerVisibleInvoiceVersion(args: {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
  shopId?: string;
}): Promise<InvoiceVersionView | null> {
  const client = args.supabase as unknown as DynamicClient;
  let query = client
    .from("invoice_versions")
    .select(SELECT_COLUMNS)
    .eq("work_order_id", args.workOrderId)
    .in("lifecycle_status", CUSTOMER_VISIBLE_INVOICE_STATES);
  if (args.shopId) query = query.eq("shop_id", args.shopId);
  const { data, error } = await query
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle<InvoiceVersionView>();
  if (error) throw new Error(error.message);
  return data;
}

export async function listCustomerVisibleInvoiceVersions(args: {
  supabase: SupabaseClient<DB>;
  workOrderIds: string[];
}): Promise<InvoiceVersionView[]> {
  if (args.workOrderIds.length === 0) return [];
  const client = args.supabase as unknown as DynamicClient;
  const { data, error } = await client
    .from("invoice_versions")
    .select(SELECT_COLUMNS)
    .in("work_order_id", args.workOrderIds)
    .in("lifecycle_status", CUSTOMER_VISIBLE_INVOICE_STATES)
    .order("issued_at", { ascending: false, nullsFirst: false })
    .returns<InvoiceVersionView[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type { InvoiceVersionView };
