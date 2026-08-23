export type RequestFlowDisplay = "pending" | "in_progress" | "ready" | "complete";
export type RequestFlowCounts = Record<RequestFlowDisplay, number>;
export type PartsRequestStage = "needs_quote" | "awaiting_approval" | "order_receive" | "ready_for_tech" | "completed";
export type CanonicalPartsStatus =
  | "requested"
  | "quoted"
  | "awaiting_approval"
  | "approved"
  | "ordered"
  | "partially_received"
  | "received"
  | "allocated"
  | "partially_returned"
  | "returned"
  | "declined"
  | "cancelled";
export type ItemFlowDisplay = CanonicalPartsStatus;
export type PartsRequestStageCounts = Record<PartsRequestStage, number>;

export type ReceiveProgressDisplay = "not_received" | "partial" | "received" | "allocated";

export const REQUEST_STATUS_CANONICAL: RequestFlowDisplay[] = ["pending", "in_progress", "ready", "complete"];
export const ITEM_STATUS_CANONICAL: ItemFlowDisplay[] = [
  "requested",
  "quoted",
  "awaiting_approval",
  "approved",
  "ordered",
  "partially_received",
  "received",
  "allocated",
  "partially_returned",
  "returned",
  "declined",
  "cancelled",
];

const CANONICAL_STATUS_ALIASES = new Set([
  ...ITEM_STATUS_CANONICAL,
  "awaiting_customer_approval",
  "partially_ordered",
  "reserved",
  "picking",
  "picked",
  "fulfilled",
  "consumed",
  "partially_consumed",
  "rejected",
  "deferred",
  "canceled",
  "voided",
]);

export const PARTS_REQUEST_STAGE_ORDER: PartsRequestStage[] = ["needs_quote", "awaiting_approval", "order_receive", "ready_for_tech", "completed"];

function asNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function requestFlowLabel(status: RequestFlowDisplay): string {
  if (status === "pending") return "Pending";
  if (status === "in_progress") return "In Progress";
  if (status === "ready") return "Ready to Allocate";
  return "Complete";
}

export function summarizeRequestFlowDisplays(
  states: RequestFlowDisplay[],
): RequestFlowCounts {
  const counts: RequestFlowCounts = {
    pending: 0,
    in_progress: 0,
    ready: 0,
    complete: 0,
  };

  for (const state of states) counts[state] += 1;
  return counts;
}

export function itemFlowLabel(status: ItemFlowDisplay): string {
  if (status === "awaiting_approval") return "Awaiting Approval";
  if (status === "partially_received") return "Partially Received";
  if (status === "partially_returned") return "Partially Returned";
  if (status === "allocated") return "Allocated";
  return status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ");
}

export function receiveProgressLabel(status: ReceiveProgressDisplay): string {
  if (status === "not_received") return "Awaiting Receive";
  if (status === "partial") return "Partially Received";
  if (status === "allocated") return "Allocated";
  return "Received";
}

export function canonicalStatusLabel(rawStatus?: string | null): string {
  const status = String(rawStatus ?? "").trim().toLowerCase();
  if (!status) return "Pending";
  if (CANONICAL_STATUS_ALIASES.has(status)) {
    return itemFlowLabel(toCanonicalPartsStatus({ rawStatus: status }));
  }
  return status.replaceAll("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function partsRequestStageLabel(stage: PartsRequestStage): string {
  if (stage === "needs_quote") return "Needs Quote";
  if (stage === "awaiting_approval") return "Awaiting Approval";
  if (stage === "order_receive") return "Order & Receive";
  if (stage === "ready_for_tech") return "Ready for Tech";
  return "Completed";
}

export function summarizePartsRequestStages(
  stages: PartsRequestStage[],
): PartsRequestStageCounts {
  const counts: PartsRequestStageCounts = {
    needs_quote: 0,
    awaiting_approval: 0,
    order_receive: 0,
    ready_for_tech: 0,
    completed: 0,
  };
  for (const stage of stages) counts[stage] += 1;
  return counts;
}

export type PartsRequestStageItem = {
  description?: string | null;
  partId?: string | null;
  requestedPartNumber?: string | null;
  requestedManufacturer?: string | null;
  quotedPrice?: unknown;
  unitPrice?: unknown;
  qty?: unknown;
  qtyRequested?: unknown;
  qtyApproved?: unknown;
  qtyOrdered?: unknown;
  qtyReceived?: unknown;
  qtyReserved?: unknown;
  qtyConsumed?: unknown;
  qtyReturned?: unknown;
  rawStatus?: string | null;
};

function targetQty(item: PartsRequestStageItem): number {
  const approved = asNum(item.qtyApproved);
  const requested = asNum(item.qtyRequested);
  const qty = asNum(item.qty);
  return Math.max(approved, requested, qty, 0);
}

export function canonicalPartQuantity(item: {
  qty?: unknown;
  qtyRequested?: unknown;
  qtyApproved?: unknown;
}): number {
  return Math.max(
    asNum(item.qty),
    asNum(item.qtyRequested),
    asNum(item.qtyApproved),
    0,
  );
}

function requestedQty(item: PartsRequestStageItem): number {
  return canonicalPartQuantity(item);
}

export function isPartsRequestItemPriced(item: PartsRequestStageItem): boolean {
  const description = String(item.description ?? "").trim();
  const hasIdentity = [
    description,
    item.partId,
    item.requestedPartNumber,
    item.requestedManufacturer,
  ].some((value) => String(value ?? "").trim().length > 0);
  const rawPrice = item.quotedPrice ?? item.unitPrice;
  const price = rawPrice == null ? null : Number(rawPrice);
  return (
    hasIdentity &&
    requestedQty(item) > 0 &&
    price != null &&
    Number.isFinite(price) &&
    price >= 0
  );
}

/**
 * Service-menu intake is complete only when the catalog link, reusable
 * quantity, and canonical unit price persisted by the intake RPC are present.
 * A legacy quoted price alone must not make the recipe look reviewed.
 */
export function isMenuIntakeItemReviewed(
  item: PartsRequestStageItem,
): boolean {
  const hasPart = String(item.partId ?? "").trim().length > 0;
  return hasPart && requestedQty(item) > 0 && item.unitPrice != null;
}

export function toMenuIntakeStage(input: {
  rawStatus?: string | null;
  items?: PartsRequestStageItem[];
}): PartsRequestStage {
  const status = String(input.rawStatus ?? "")
    .trim()
    .toLowerCase();
  const items = (input.items ?? []).filter(
    (item) => String(item.rawStatus ?? "").toLowerCase() !== "cancelled",
  );

  if (
    ["fulfilled", "rejected", "cancelled", "deferred", "returned"].includes(
      status,
    )
  ) {
    return "completed";
  }

  return items.length > 0 && items.every(isMenuIntakeItemReviewed)
    ? "completed"
    : "needs_quote";
}

export function isPartsRequestItemStaged(item: PartsRequestStageItem): boolean {
  const target = targetQty(item);
  const netConsumed = Math.max(asNum(item.qtyConsumed) - asNum(item.qtyReturned), 0);
  return target > 0 && asNum(item.qtyReserved) + netConsumed >= target;
}

export function isPartsRequestItemHandedOff(item: PartsRequestStageItem): boolean {
  const target = targetQty(item);
  const netConsumed = Math.max(asNum(item.qtyConsumed) - asNum(item.qtyReturned), 0);
  return target > 0 && netConsumed >= target;
}

const DECLINED_STATUSES = new Set([
  "declined",
  "rejected",
  "deferred",
]);
const CANCELLED_STATUSES = new Set(["cancelled", "canceled", "voided"]);

export function toCanonicalPartsStatus(
  input: PartsRequestStageItem,
): CanonicalPartsStatus {
  const status = String(input.rawStatus ?? "")
    .trim()
    .toLowerCase();
  if (CANCELLED_STATUSES.has(status)) return "cancelled";
  if (DECLINED_STATUSES.has(status)) return "declined";

  const target = targetQty(input);
  const netConsumed = Math.max(
    asNum(input.qtyConsumed) - asNum(input.qtyReturned),
    0,
  );
  const staged = asNum(input.qtyReserved) + netConsumed;
  const received = asNum(input.qtyReceived);
  const ordered = asNum(input.qtyOrdered);

  if (status === "returned") return "returned";
  if (status === "partially_returned") return "partially_returned";

  if (
    status === "fulfilled" ||
    status === "consumed" ||
    status === "partially_consumed" ||
    (target > 0 && staged >= target)
  ) {
    return "allocated";
  }
  if (status === "received" || (target > 0 && received >= target)) {
    return "received";
  }
  if (received > 0 || status === "partially_received") {
    return "partially_received";
  }
  if (
    ordered > 0 ||
    ["ordered", "partially_ordered", "reserved", "picking", "picked"].includes(
      status,
    )
  ) {
    return "ordered";
  }
  if (status === "approved") return "approved";
  if (status === "awaiting_customer_approval" || status === "awaiting_approval") {
    return "awaiting_approval";
  }
  if (status === "quoted" || isPartsRequestItemPriced(input)) return "quoted";
  return "requested";
}

export function toPartsRequestStage(input: { rawStatus?: string | null; items?: PartsRequestStageItem[] }): PartsRequestStage {
  const status = String(input.rawStatus ?? "")
    .trim()
    .toLowerCase();
  const items = (input.items ?? []).filter((item) => String(item.rawStatus ?? "").toLowerCase() !== "cancelled");

  if (["fulfilled", "rejected", "cancelled", "deferred", "returned"].includes(status)) {
    return "completed";
  }
  if (items.length === 0 || !items.every(isPartsRequestItemPriced)) {
    return "needs_quote";
  }
  if (items.every(isPartsRequestItemHandedOff)) return "completed";
  const itemStates = items.map(toCanonicalPartsStatus);
  if (items.every(isPartsRequestItemStaged)) return "ready_for_tech";
  if (
    itemStates.some((state) =>
      [
        "approved",
        "ordered",
        "partially_received",
        "received",
        "allocated",
        "partially_returned",
        "returned",
      ].includes(state),
    )
  ) {
    return "order_receive";
  }
  if (
    status === "requested" ||
    status === "quoted" ||
    itemStates.some((state) => state === "awaiting_approval")
  ) {
    return "awaiting_approval";
  }
  return "order_receive";
}

export function earliestPartsRequestStage(stages: PartsRequestStage[]): PartsRequestStage {
  if (stages.length === 0) return "needs_quote";
  return stages.reduce((earliest, current) => (PARTS_REQUEST_STAGE_ORDER.indexOf(current) < PARTS_REQUEST_STAGE_ORDER.indexOf(earliest) ? current : earliest));
}

export function toReceiveProgressDisplay(input: { qty?: unknown; qtyApproved?: unknown; qtyReceived?: unknown; qtyAllocated?: unknown }): ReceiveProgressDisplay {
  const qty = asNum(input.qty);
  const approved = asNum(input.qtyApproved);
  const received = asNum(input.qtyReceived);
  const allocated = asNum(input.qtyAllocated);
  const target = approved > 0 ? approved : qty;

  if (target > 0 && allocated >= target) return "allocated";
  if (target > 0 && received >= target) return "received";
  if (received > 0) return "partial";
  return "not_received";
}

export function toItemFlowDisplay(input: {
  rawStatus?: string | null;
  qty?: unknown;
  qtyRequested?: unknown;
  qtyApproved?: unknown;
  qtyOrdered?: unknown;
  qtyReceived?: unknown;
  qtyAllocated?: unknown;
  qtyReserved?: unknown;
  qtyConsumed?: unknown;
  qtyReturned?: unknown;
  description?: string | null;
  partId?: string | null;
  requestedPartNumber?: string | null;
  requestedManufacturer?: string | null;
  quotedPrice?: unknown;
  unitPrice?: unknown;
}): ItemFlowDisplay {
  return toCanonicalPartsStatus({
    ...input,
    qtyConsumed: input.qtyConsumed ?? input.qtyAllocated,
  });
}

export function toRequestFlowDisplay(input: { rawStatus?: string | null; itemStates?: ItemFlowDisplay[] }): RequestFlowDisplay {
  const status = String(input.rawStatus ?? "").toLowerCase();
  const itemStates = input.itemStates ?? [];

  // Persisted terminal/request-level states must not be hidden by stale item rows.
  if (status === "fulfilled") return "complete";

  if (itemStates.length > 0) {
    if (itemStates.every((s) => s === "allocated" || s === "returned" || s === "declined" || s === "cancelled")) return "complete";
    if (itemStates.every((s) => s === "received" || s === "allocated")) return "ready";
    if (itemStates.some((s) => !["requested", "quoted", "awaiting_approval"].includes(s))) return "in_progress";

    // A request that has been quoted or approved is operationally in progress even
    // when its item rows have not yet moved into ordering/receiving states.
    if (status === "approved" || status === "quoted") return "in_progress";
    return "pending";
  }

  if (status === "approved" || status === "quoted") return "in_progress";
  return "pending";
}
