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

const QUERY_PAGE_SIZE = 500;
const ID_FILTER_CHUNK_SIZE = 100;

export type FieldInvoiceHistoryScope =
  | { kind: "shop" }
  | { kind: "work_orders"; ids: readonly string[] };

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

async function collectAllPages<T>(
  loadPage: (from: number, to: number) => Promise<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const page = await loadPage(from, from + QUERY_PAGE_SIZE - 1);
    if (page.error) throw new Error(page.error.message);
    const pageRows = page.data ?? [];
    if (pageRows.length === 0) return rows;
    rows.push(...pageRows);
    from += pageRows.length;
  }
}

function chunkIds(ids: readonly string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += ID_FILTER_CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + ID_FILTER_CHUNK_SIZE));
  }
  return chunks;
}

export async function listFieldInvoiceHistory(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  scope: FieldInvoiceHistoryScope;
}): Promise<FieldInvoiceHistoryRow[]> {
  const scopedIds =
    args.scope.kind === "work_orders"
      ? [...new Set(args.scope.ids.map((id) => id.trim()).filter(Boolean))]
      : null;
  if (scopedIds && scopedIds.length === 0) return [];

  const workOrderIdGroups = scopedIds ? chunkIds(scopedIds) : [null];
  const workOrdersById = new Map<string, FieldInvoiceWorkOrder>();

  for (const idGroup of workOrderIdGroups) {
    const pageRows = await collectAllPages<FieldInvoiceWorkOrder>(
      async (from, to) => {
        let query = args.supabase
          .from("work_orders")
          .select(
            "id,custom_id,updated_at,paid_at,customers:customers(first_name,last_name,email),vehicles:vehicles(year,make,model,license_plate)",
          )
          .eq("shop_id", args.shopId)
          .eq("status", "invoiced");
        if (idGroup) query = query.in("id", idGroup);
        const result = await query
          .order("id", { ascending: true })
          .range(from, to);
        return {
          data: (result.data ?? null) as unknown as
            | FieldInvoiceWorkOrder[]
            | null,
          error: result.error,
        };
      },
    );
    for (const workOrder of pageRows)
      workOrdersById.set(workOrder.id, workOrder);
  }

  const workOrders = [...workOrdersById.values()];
  if (workOrders.length === 0) return [];

  const versionsById = new Map<string, FieldInvoiceVersion>();
  for (const workOrderIds of chunkIds(
    workOrders.map((workOrder) => workOrder.id),
  )) {
    const pageRows = await collectAllPages<FieldInvoiceVersion>(
      async (from, to) => {
        const result = await args.supabase
          .from("invoice_versions")
          .select(
            "id,work_order_id,version_number,lifecycle_status,currency,total,paid_total,refunded_total,outstanding_total,issued_at,created_at,invoices:invoices!invoice_versions_invoice_id_fkey(invoice_number)",
          )
          .eq("shop_id", args.shopId)
          .in("work_order_id", workOrderIds)
          .in("lifecycle_status", [...FIELD_INVOICE_ACTIVE_STATES])
          .order("work_order_id", { ascending: true })
          .order("version_number", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to);
        return {
          data: (result.data ?? null) as unknown as
            | FieldInvoiceVersion[]
            | null,
          error: result.error,
        };
      },
    );
    for (const version of pageRows) versionsById.set(version.id, version);
  }

  return buildFieldInvoiceHistoryRows(workOrders, [...versionsById.values()]);
}
