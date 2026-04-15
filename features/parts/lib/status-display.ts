export type RequestFlowDisplay = "pending" | "in_progress" | "ready" | "complete";
export type ItemFlowDisplay =
  | "requested"
  | "ordered"
  | "partially_received"
  | "received"
  | "consumed";

export type ReceiveProgressDisplay = "not_received" | "partial" | "received" | "allocated";

export const REQUEST_STATUS_CANONICAL: RequestFlowDisplay[] = ["pending", "in_progress", "ready", "complete"];
export const ITEM_STATUS_CANONICAL: ItemFlowDisplay[] = [
  "requested",
  "ordered",
  "partially_received",
  "received",
  "consumed",
];

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
  const status = String(rawStatus ?? "").trim().toLowerCase();
  if (!status) return "Pending";
  if (status === "requested") return "Requested";
  if (status === "quoted") return "Quoted";
  if (status === "approved") return "Approved";
  if (status === "ordered") return "Ordered";
  if (status === "partially_received") return "Partially Received";
  if (status === "received") return "Received";
  if (status === "fulfilled") return "Allocated / Consumed";
  if (status === "consumed") return "Allocated / Consumed";
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function toReceiveProgressDisplay(input: {
  qty?: unknown;
  qtyApproved?: unknown;
  qtyReceived?: unknown;
  qtyAllocated?: unknown;
}): ReceiveProgressDisplay {
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
  qtyApproved?: unknown;
  qtyReceived?: unknown;
  qtyAllocated?: unknown;
}): ItemFlowDisplay {
  const status = String(input.rawStatus ?? "").toLowerCase();
  const receiveState = toReceiveProgressDisplay(input);

  if (receiveState === "allocated") return "consumed";
  if (status === "fulfilled") return "consumed";
  if (receiveState === "received") return "received";
  if (receiveState === "partial") return "partially_received";

  if (
    status.includes("ordered") ||
    status === "approved" ||
    status === "reserved" ||
    status === "picking" ||
    status === "picked"
  ) {
    return "ordered";
  }

  return "requested";
}

export function toRequestFlowDisplay(input: {
  rawStatus?: string | null;
  itemStates?: ItemFlowDisplay[];
}): RequestFlowDisplay {
  const status = String(input.rawStatus ?? "").toLowerCase();
  const itemStates = input.itemStates ?? [];

  if (itemStates.length > 0) {
    if (itemStates.every((s) => s === "consumed")) return "complete";
    if (itemStates.every((s) => s === "received" || s === "consumed")) return "ready";
    if (itemStates.some((s) => s !== "requested")) return "in_progress";
    return "pending";
  }

  if (status === "fulfilled") return "complete";
  if (status === "approved" || status === "quoted") return "in_progress";
  return "pending";
}
