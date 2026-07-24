import type { WorkOrderBoardRow } from "@/features/shared/lib/workboard/types";

const TERMINAL_REQUEST_STATUSES = new Set([
  "cancelled",
  "deferred",
  "fulfilled",
  "rejected",
  "returned",
]);

const TERMINAL_ITEM_STATUSES = new Set([
  "cancelled",
  "consumed",
  "fulfilled",
  "returned",
]);

const OPERATIONAL_REQUEST_STATUSES = new Set([
  "approved",
  "partially_consumed",
  "partially_ordered",
  "partially_returned",
]);

const OPERATIONAL_ITEM_STATUSES = new Set([
  "approved",
  "ordered",
  "partially_received",
  "picked",
  "picking",
  "received",
  "reserved",
]);

const RECEIVING_ITEM_STATUSES = new Set([
  "ordered",
  "partially_ordered",
  "partially_received",
]);

export type OpenPartsRequest = {
  id: string;
  work_order_id: string | null;
  status: string | null;
};

export type OpenPartsItem = {
  request_id: string;
  status: string | null;
  po_id?: string | null;
  qty?: unknown;
  qty_requested?: unknown;
  qty_approved?: unknown;
  qty_ordered?: unknown;
  qty_received?: unknown;
  qty_reserved?: unknown;
  qty_consumed?: unknown;
  qty_returned?: unknown;
};

function quantity(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

function normalizedStatus(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function targetQuantity(item: OpenPartsItem): number {
  return Math.max(
    quantity(item.qty_approved),
    quantity(item.qty_ordered),
    quantity(item.qty_requested),
    quantity(item.qty),
  );
}

function netHandedOffQuantity(item: OpenPartsItem): number {
  return Math.max(quantity(item.qty_consumed) - quantity(item.qty_returned), 0);
}

export function isPartRequestItemAwaitingReceiving(
  item: OpenPartsItem,
): boolean {
  const ordered = quantity(item.qty_ordered);
  const received = quantity(item.qty_received);
  return (
    Boolean(item.po_id) &&
    ordered > 0 &&
    received < ordered &&
    RECEIVING_ITEM_STATUSES.has(normalizedStatus(item.status))
  );
}

export function isOpenPartsObligation(
  requestStatus: string | null | undefined,
  item: OpenPartsItem,
): boolean {
  const normalizedRequestStatus = normalizedStatus(requestStatus);
  const normalizedItemStatus = normalizedStatus(item.status);
  if (
    TERMINAL_REQUEST_STATUSES.has(normalizedRequestStatus) ||
    TERMINAL_ITEM_STATUSES.has(normalizedItemStatus)
  ) {
    return false;
  }

  const target = targetQuantity(item);
  if (target <= 0 || netHandedOffQuantity(item) >= target) {
    return false;
  }

  return (
    OPERATIONAL_REQUEST_STATUSES.has(normalizedRequestStatus) ||
    OPERATIONAL_ITEM_STATUSES.has(normalizedItemStatus) ||
    quantity(item.qty_ordered) > 0 ||
    quantity(item.qty_received) > 0 ||
    quantity(item.qty_reserved) > 0
  );
}

export function countOpenPartsObligationsByWorkOrder(
  requests: OpenPartsRequest[],
  items: OpenPartsItem[],
): Map<string, number> {
  const requestById = new Map(requests.map((request) => [request.id, request]));
  const counts = new Map<string, number>();

  for (const item of items) {
    const request = requestById.get(item.request_id);
    if (
      !request?.work_order_id ||
      !isOpenPartsObligation(request.status, item)
    ) {
      continue;
    }
    counts.set(
      request.work_order_id,
      (counts.get(request.work_order_id) ?? 0) + 1,
    );
  }

  return counts;
}

export function reconcileBoardPartsState(
  rows: WorkOrderBoardRow[],
  openCounts: Map<string, number>,
  activeLaborWorkOrderIds: ReadonlySet<string>,
): WorkOrderBoardRow[] {
  return rows.map((row) => {
    const openCount = openCounts.get(row.work_order_id) ?? 0;
    const staleWaitingState =
      openCount === 0 &&
      (row.has_waiting_parts === true ||
        Number(row.parts_blocker_count ?? 0) > 0 ||
        Number(row.jobs_waiting_parts ?? 0) > 0 ||
        row.overall_stage === "waiting_parts");

    if (!staleWaitingState) {
      return activeLaborWorkOrderIds.has(row.work_order_id) &&
        row.overall_stage !== "completed"
        ? { ...row, overall_stage: "in_progress" }
        : row;
    }

    return {
      ...row,
      has_waiting_parts: false,
      parts_blocker_count: 0,
      jobs_waiting_parts: 0,
      overall_stage:
        row.overall_stage === "waiting_parts"
          ? activeLaborWorkOrderIds.has(row.work_order_id)
            ? "in_progress"
            : "awaiting"
          : row.overall_stage,
    };
  });
}
