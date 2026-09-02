import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import type { CanonicalRole } from "@/features/shared/lib/rbac";
import { loadRowsForIdChunks } from "@/features/work-orders/lib/data/loadCanonicalWorkOrderLineContext";
import {
  PARTS_REQUEST_QUEUE_STATUSES,
  type PartsRequestQueueItem,
  type PartsRequestQueueMenuItem,
  type PartsRequestQueueRequest,
  type PartsRequestQueueSnapshot,
  type PartsRequestQueueWorkOrder,
} from "@/features/parts/lib/requests/parts-request-queue";

type DB = Database;

export const PARTS_REQUEST_QUEUE_ROLES: readonly CanonicalRole[] = [
  "owner",
  "admin",
  "manager",
  "parts",
];

// Preserve the established page-guard contract while the queue API and loader
// share the same canonical role set.
export const PARTS_REQUEST_ACCESS_ROLES = PARTS_REQUEST_QUEUE_ROLES;

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

async function loadAllPages<T>(
  readPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 500,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await readPage(from, from + pageSize - 1);
    if (result.error) throw new Error(result.error.message);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function loadPartsRequestQueue(input: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  requestId?: string | null;
  workOrderIds?: readonly string[];
  signal?: AbortSignal;
}): Promise<PartsRequestQueueSnapshot> {
  const signal = input.signal ?? new AbortController().signal;
  const readRequests = (from: number, to: number, workOrderIds?: string[]) => {
    let query = input.supabase
      .from("part_requests")
      .select("*")
      .eq("shop_id", input.shopId)
      .in("status", PARTS_REQUEST_QUEUE_STATUSES);
    if (input.requestId) query = query.eq("id", input.requestId);
    if (workOrderIds) query = query.in("work_order_id", workOrderIds);
    return query
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .abortSignal(signal)
      .range(from, to) as unknown as PromiseLike<
      PageResult<PartsRequestQueueRequest>
    >;
  };
  const requests = input.workOrderIds
    ? await loadRowsForIdChunks<PartsRequestQueueRequest>(
        [...input.workOrderIds],
        (workOrderIds, from, to) => readRequests(from, to, workOrderIds),
        { idChunkSize: 200, pageSize: 500 },
      )
    : await loadAllPages<PartsRequestQueueRequest>((from, to) =>
        readRequests(from, to),
      );

  if (requests.length === 0) {
    return {
      shopId: input.shopId,
      requests: [],
      items: [],
      workOrders: [],
      menuItems: [],
    };
  }

  const requestIds = requests.map((request) => request.id);
  const workOrderIds = requests
    .map((request) => request.work_order_id)
    .filter((value): value is string => Boolean(value));
  const menuItemIds = requests
    .map((request) => request.source_menu_item_id)
    .filter((value): value is string => Boolean(value));

  const [items, workOrders, menuItems] = await Promise.all([
    loadRowsForIdChunks<PartsRequestQueueItem>(
      requestIds,
      (ids, from, to) =>
        input.supabase
          .from("part_request_items")
          .select(
            "id,request_id,description,part_id,requested_part_number,requested_manufacturer,quoted_price,unit_price,unit_cost,qty,qty_requested,qty_approved,qty_ordered,qty_received,qty_reserved,qty_consumed,qty_returned,status,work_order_line_id,created_at,updated_at",
          )
          .eq("shop_id", input.shopId)
          .in("request_id", ids)
          .order("id", { ascending: true })
          .abortSignal(signal)
          .range(from, to) as unknown as PromiseLike<
          PageResult<PartsRequestQueueItem>
        >,
      { idChunkSize: 200, pageSize: 1000 },
    ),
    loadRowsForIdChunks<PartsRequestQueueWorkOrder>(
      workOrderIds,
      (ids, from, to) =>
        input.supabase
          .from("work_orders")
          .select(
            "id,custom_id,estimate_number,customers(business_name,first_name,last_name),vehicles(year,make,model,vin,unit_number)",
          )
          .eq("shop_id", input.shopId)
          .in("id", ids)
          .order("id", { ascending: true })
          .abortSignal(signal)
          .range(from, to) as unknown as PromiseLike<
          PageResult<PartsRequestQueueWorkOrder>
        >,
      { idChunkSize: 200, pageSize: 500 },
    ),
    loadRowsForIdChunks<PartsRequestQueueMenuItem>(
      menuItemIds,
      (ids, from, to) =>
        input.supabase
          .from("menu_items")
          .select("id,name")
          .eq("shop_id", input.shopId)
          .in("id", ids)
          .order("id", { ascending: true })
          .abortSignal(signal)
          .range(from, to) as unknown as PromiseLike<
          PageResult<PartsRequestQueueMenuItem>
        >,
      { idChunkSize: 200, pageSize: 500 },
    ),
  ]);

  return {
    shopId: input.shopId,
    requests,
    items,
    workOrders,
    menuItems,
  };
}
