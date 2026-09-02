import type { Database } from "@shared/types/types/supabase";
import {
  toMenuIntakeStage,
  toPartsRequestStage,
  type PartsRequestStage,
  type PartsRequestStageItem,
} from "@/features/parts/lib/status-display";

type DB = Database;
export type PartsRequestQueueRequest =
  DB["public"]["Tables"]["part_requests"]["Row"];
type PartRequestItem = DB["public"]["Tables"]["part_request_items"]["Row"];

export type PartsRequestQueueItem = Pick<
  PartRequestItem,
  | "id"
  | "request_id"
  | "description"
  | "part_id"
  | "requested_part_number"
  | "requested_manufacturer"
  | "quoted_price"
  | "unit_price"
  | "qty"
  | "qty_requested"
  | "qty_approved"
  | "qty_ordered"
  | "qty_received"
  | "qty_reserved"
  | "qty_consumed"
  | "qty_returned"
  | "status"
  | "unit_cost"
  | "work_order_line_id"
  | "created_at"
  | "updated_at"
>;

export type PartsRequestQueueWorkOrder = {
  id: string;
  custom_id: string | null;
  estimate_number: string | null;
  customers:
    | {
        business_name: string | null;
        first_name: string | null;
        last_name: string | null;
      }
    | {
        business_name: string | null;
        first_name: string | null;
        last_name: string | null;
      }[]
    | null;
  vehicles:
    | {
        year: string | number | null;
        make: string | null;
        model: string | null;
        vin: string | null;
        unit_number: string | null;
      }
    | {
        year: string | number | null;
        make: string | null;
        model: string | null;
        vin: string | null;
        unit_number: string | null;
      }[]
    | null;
};

export type PartsRequestQueueMenuItem = {
  id: string;
  name: string | null;
};

export type PartsRequestQueueSnapshot = {
  shopId: string;
  requests: PartsRequestQueueRequest[];
  items: PartsRequestQueueItem[];
  workOrders: PartsRequestQueueWorkOrder[];
  menuItems: PartsRequestQueueMenuItem[];
};

export type PartsRequestQueueModel = {
  request: PartsRequestQueueRequest;
  items: PartsRequestQueueItem[];
  stage: PartsRequestStage;
};

export const PARTS_REQUEST_QUEUE_STATUSES: PartsRequestQueueRequest["status"][] =
  [
    "requested",
    "quoted",
    "approved",
    "partially_ordered",
    "partially_consumed",
    "partially_returned",
    "returned",
    "fulfilled",
    "rejected",
    "deferred",
    "cancelled",
  ];

function stageItem(item: PartsRequestQueueItem): PartsRequestStageItem {
  return {
    description: item.description,
    partId: item.part_id,
    requestedPartNumber: item.requested_part_number,
    requestedManufacturer: item.requested_manufacturer,
    quotedPrice: item.quoted_price,
    unitPrice: item.unit_price,
    qty: item.qty,
    qtyRequested: item.qty_requested,
    qtyApproved: item.qty_approved,
    qtyOrdered: item.qty_ordered,
    qtyReceived: item.qty_received,
    qtyReserved: item.qty_reserved,
    qtyConsumed: item.qty_consumed,
    qtyReturned: item.qty_returned,
    rawStatus: item.status,
  };
}

export function buildPartsRequestQueueModels(
  snapshot: PartsRequestQueueSnapshot,
): PartsRequestQueueModel[] {
  const itemsByRequest = new Map<string, PartsRequestQueueItem[]>();
  for (const item of snapshot.items) {
    itemsByRequest.set(item.request_id, [
      ...(itemsByRequest.get(item.request_id) ?? []),
      item,
    ]);
  }

  return snapshot.requests.map((request) => {
    const items = itemsByRequest.get(request.id) ?? [];
    const isMenuIntake =
      Boolean(request.source_menu_item_id) && !request.work_order_id;
    return {
      request,
      items,
      stage: isMenuIntake
        ? toMenuIntakeStage({
            rawStatus: request.status,
            items: items.map(stageItem),
          })
        : toPartsRequestStage({
            rawStatus: request.status,
            items: items.map(stageItem),
          }),
    };
  });
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

/**
 * Replace the complete aggregate for one request. Repeated realtime deliveries
 * are therefore idempotent and cannot append duplicate request or item rows.
 */
export function reconcilePartsRequestQueueSnapshot(
  current: PartsRequestQueueSnapshot,
  delta: PartsRequestQueueSnapshot,
  requestId: string,
): PartsRequestQueueSnapshot {
  const requests = uniqueById([
    ...current.requests.filter((row) => row.id !== requestId),
    ...delta.requests,
  ]).sort((left, right) => {
    const byCreatedAt = String(right.created_at ?? "").localeCompare(
      String(left.created_at ?? ""),
    );
    return byCreatedAt || left.id.localeCompare(right.id);
  });
  const items = uniqueById([
    ...current.items.filter((row) => row.request_id !== requestId),
    ...delta.items,
  ]).sort((left, right) => left.id.localeCompare(right.id));

  return {
    shopId: current.shopId,
    requests,
    items,
    workOrders: uniqueById([...current.workOrders, ...delta.workOrders]),
    menuItems: uniqueById([...current.menuItems, ...delta.menuItems]),
  };
}

type RealtimePayloadLike = {
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
};

export function readPartsRequestIdFromRealtimePayload(
  payload: unknown,
  source: "request" | "item",
): string | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as RealtimePayloadLike;
  const key = source === "request" ? "id" : "request_id";
  const value = candidate.new?.[key] ?? candidate.old?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function isPartsRequestQueueSnapshot(
  value: unknown,
): value is PartsRequestQueueSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<PartsRequestQueueSnapshot>;
  return (
    typeof snapshot.shopId === "string" &&
    Array.isArray(snapshot.requests) &&
    Array.isArray(snapshot.items) &&
    Array.isArray(snapshot.workOrders) &&
    Array.isArray(snapshot.menuItems)
  );
}
