import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import {
  buildFieldInvoiceHistoryRows,
  FIELD_INVOICE_ACTIVE_STATES,
  type FieldInvoiceHistoryRow,
  type FieldInvoiceVersion,
  type FieldInvoiceWorkOrder,
} from "@/features/mobile/service/fieldInvoiceHistory";

type DB = Database;

export async function listFieldInvoiceHistory(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
}): Promise<FieldInvoiceHistoryRow[]> {
  const { data: workOrderData, error: workOrderError } = await args.supabase
    .from("work_orders")
    .select(
      "id,custom_id,updated_at,paid_at,customers:customers(first_name,last_name,email),vehicles:vehicles(year,make,model,license_plate)",
    )
    .eq("shop_id", args.shopId)
    .eq("status", "invoiced")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (workOrderError) throw new Error(workOrderError.message);
  const workOrders = (workOrderData ?? []) as FieldInvoiceWorkOrder[];
  if (workOrders.length === 0) return [];

  const { data: versionData, error: versionError } = await args.supabase
    .from("invoice_versions")
    .select(
      "id,work_order_id,version_number,lifecycle_status,currency,total,paid_total,refunded_total,outstanding_total,issued_at,created_at,invoices:invoices(invoice_number)",
    )
    .eq("shop_id", args.shopId)
    .in("work_order_id", workOrders.map((workOrder) => workOrder.id))
    .in("lifecycle_status", [...FIELD_INVOICE_ACTIVE_STATES])
    .order("version_number", { ascending: false });

  if (versionError) throw new Error(versionError.message);
  return buildFieldInvoiceHistoryRows(
    workOrders,
    (versionData ?? []) as FieldInvoiceVersion[],
  );
}
