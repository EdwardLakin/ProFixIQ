export type RequestFlowDisplay = "pending" | "in_progress" | "ready" | "complete";
export type PartsRequestStage = "needs_quote" | "awaiting_approval" | "order_receive" | "ready_for_tech" | "completed";
export type ItemFlowDisplay = "requested" | "ordered" | "partially_received" | "received" | "consumed";

export type ReceiveProgressDisplay = "not_received" | "partial" | "received" | "allocated";

export const REQUEST_STATUS_CANONICAL: RequestFlowDisplay[] = ["pending", "in_progress", "ready", "complete"];
export const ITEM_STATUS_CANONICAL: ItemFlowDisplay[] = ["requested", "ordered", "partially_received", "received", "consumed"];

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

export function itemFlowLabel(status: ItemFlowDisplay): string {
  if (status === "partially_received") return "Partially Received";
  if (status === "consumed") return "Allocated / Consumed";
  return status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ");
}

export function receiveProgressLabel(status: ReceiveProgressDisplay): string {
  if (status === "not_received") return "Awaiting Receive";
  if (status === "partial") return "Partially Received";
  if (status === "allocated") return "Allocated";
  return "Received";
}

export function canonicalStatusLabel(rawStatus?: string | null): string {
  const status = String(rawStatus ?? "")
    .trim()
    .toLowerCase();
  if (!status) return "Pending";
  if (status === "requested") return "Requested";
  if (status === "quoted") return "Quoted";
  if (status === "approved") return "Approved";
  if (status === "ordered") return "Ordered";
  if (status === "partially_received") return "Partially Received";
  if (status === "received") return "Received";
  if (status === "fulfilled") return "Allocated / Consumed";
  if (status === "consumed") return "Allocated / Consumed";
  return status.replaceAll("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function partsRequestStageLabel(stage: PartsRequestStage): string {
  if (stage === "needs_quote") return "Needs Quote";
  if (stage === "awaiting_approval") return "Awaiting Approval";
  if (stage === "order_receive") return "Order & Receive";
  if (stage === "ready_for_tech") return "Ready for Tech";
  return "Completed";
}

export type PartsRequestStageItem = {
  description?: string | null;
  partId?: string | null;
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

function requestedQty(item: PartsRequestStageItem): number {
  return Math.max(asNum(item.qtyRequested), asNum(item.qty), 0);
}

export function isPartsRequestItemPriced(item: PartsRequestStageItem): boolean {
  const description = String(item.description ?? "").trim();
  const hasPart = String(item.partId ?? "").trim().length > 0;
  const hasPrice = item.quotedPrice != null || item.unitPrice != null;
  return description.length > 0 && hasPart && requestedQty(item) > 0 && hasPrice;
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
  if (status === "requested" || status === "quoted") {
    return "awaiting_approval";
  }
  if (items.every(isPartsRequestItemStaged)) return "ready_for_tech";
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

export function toItemFlowDisplay(input: { rawStatus?: string | null; qty?: unknown; qtyApproved?: unknown; qtyReceived?: unknown; qtyAllocated?: unknown }): ItemFlowDisplay {
  const status = String(input.rawStatus ?? "").toLowerCase();
  const receiveState = toReceiveProgressDisplay(input);

  if (receiveState === "allocated") return "consumed";
  if (status === "fulfilled") return "consumed";
  if (receiveState === "received") return "received";
  if (receiveState === "partial") return "partially_received";

  if (status.includes("ordered") || status === "approved" || status === "reserved" || status === "picking" || status === "picked") {
    return "ordered";
  }

  return "requested";
}

export function toRequestFlowDisplay(input: { rawStatus?: string | null; itemStates?: ItemFlowDisplay[] }): RequestFlowDisplay {
  const status = String(input.rawStatus ?? "").toLowerCase();
  const itemStates = input.itemStates ?? [];

  // Persisted terminal/request-level states must not be hidden by stale item rows.
  if (status === "fulfilled") return "complete";

  if (itemStates.length > 0) {
    if (itemStates.every((s) => s === "consumed")) return "complete";
    if (itemStates.every((s) => s === "received" || s === "consumed")) return "ready";
    if (itemStates.some((s) => s !== "requested")) return "in_progress";

    // A request that has been quoted or approved is operationally in progress even
    // when its item rows have not yet moved into ordering/receiving states.
    if (status === "approved" || status === "quoted") return "in_progress";
    return "pending";
  }

  if (status === "approved" || status === "quoted") return "in_progress";
  return "pending";
}
