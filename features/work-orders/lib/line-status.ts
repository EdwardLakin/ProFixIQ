export const CANONICAL_WORK_ORDER_LINE_STATUSES = [
  "awaiting",
  "awaiting_approval",
  "active",
  "on_hold",
  "completed",
  "invoiced",
] as const;

export type WorkOrderLineStatus =
  (typeof CANONICAL_WORK_ORDER_LINE_STATUSES)[number];

const LEGACY_TO_CANONICAL: Record<string, WorkOrderLineStatus> = {
  awaiting: "awaiting",
  awaiting_approval: "awaiting_approval",
  active: "active",
  on_hold: "on_hold",
  completed: "completed",
  invoiced: "invoiced",
  queued: "active",
  in_progress: "active",
  paused: "on_hold",
  declined: "on_hold",
  assigned: "active",
  unassigned: "awaiting",
  ready_to_invoice: "completed",
  quoted: "awaiting_approval",
};

export function normalizeWorkOrderLineStatus(value: unknown): WorkOrderLineStatus {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");

  return LEGACY_TO_CANONICAL[key] ?? "awaiting";
}

export function isWorkOrderLineStatus(value: unknown): value is WorkOrderLineStatus {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
  return CANONICAL_WORK_ORDER_LINE_STATUSES.includes(key as WorkOrderLineStatus);
}

export function assertWorkOrderLineStatus(value: unknown): WorkOrderLineStatus {
  const normalized = normalizeWorkOrderLineStatus(value);
  if (!CANONICAL_WORK_ORDER_LINE_STATUSES.includes(normalized)) {
    throw new Error(`Invalid work order line status: ${String(value ?? "")}`);
  }
  return normalized;
}
