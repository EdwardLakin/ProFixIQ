import { normalizeWorkOrderStatus } from "@/features/work-orders/lib/work-order-status";

export const WORK_ORDER_SUMMARY_FILTERS = [
  "at_risk",
  "ready_to_work",
  "waiting_parts",
  "ready_to_invoice",
] as const;

export type WorkOrderSummaryFilter =
  (typeof WORK_ORDER_SUMMARY_FILTERS)[number];

export type WorkOrderSummaryRow = {
  status?: unknown;
  priority?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
};

const READY_TO_WORK_STATUSES = new Set([
  "new",
  "awaiting",
  "awaiting_inspection",
  "recommended",
  "approved",
  "queued",
  "planned",
]);

const READY_TO_INVOICE_STATUSES = new Set(["completed", "ready_to_invoice"]);

const PRESERVED_LIST_STATUSES = new Set([
  "new",
  "awaiting",
  "awaiting_inspection",
  "recommended",
  "awaiting_approval",
  "waiting_parts",
  "approved",
  "in_progress",
  "on_hold",
  "queued",
  "planned",
  "completed",
  "ready_to_invoice",
  "invoiced",
]);

const AT_RISK_AGE_MS = 3 * 86_400_000;

export function normalizeWorkOrderListStatus(value: unknown): string {
  const normalized = String(value ?? "new")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");

  return PRESERVED_LIST_STATUSES.has(normalized)
    ? normalized
    : normalizeWorkOrderStatus(normalized);
}

function updatedAtMs(row: WorkOrderSummaryRow): number | null {
  const raw = row.updated_at ?? row.created_at;
  if (!raw) return null;

  const timestamp = new Date(raw).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function matchesWorkOrderSummaryFilter(
  row: WorkOrderSummaryRow,
  filter: WorkOrderSummaryFilter,
  nowMs = Date.now(),
): boolean {
  const status = normalizeWorkOrderListStatus(row.status);

  if (filter === "ready_to_work") {
    return READY_TO_WORK_STATUSES.has(status);
  }

  if (filter === "waiting_parts") {
    return status === "waiting_parts";
  }

  if (filter === "ready_to_invoice") {
    return READY_TO_INVOICE_STATUSES.has(status);
  }

  if (Number(row.priority ?? 3) === 1) {
    return true;
  }

  const updatedAt = updatedAtMs(row);
  return updatedAt !== null && nowMs - updatedAt >= AT_RISK_AGE_MS;
}

export function filterWorkOrdersBySummary<T extends WorkOrderSummaryRow>(
  rows: T[],
  filter: WorkOrderSummaryFilter | null,
  nowMs = Date.now(),
): T[] {
  if (!filter) return rows;
  return rows.filter((row) =>
    matchesWorkOrderSummaryFilter(row, filter, nowMs),
  );
}

export function countWorkOrdersBySummary(
  rows: WorkOrderSummaryRow[],
  filter: WorkOrderSummaryFilter,
  nowMs = Date.now(),
): number {
  return rows.reduce(
    (count, row) =>
      count + (matchesWorkOrderSummaryFilter(row, filter, nowMs) ? 1 : 0),
    0,
  );
}

export function toggleWorkOrderSummaryFilter(
  current: WorkOrderSummaryFilter | null,
  next: WorkOrderSummaryFilter,
): WorkOrderSummaryFilter | null {
  return current === next ? null : next;
}
