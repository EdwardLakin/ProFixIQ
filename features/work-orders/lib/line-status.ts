export const CANONICAL_WORK_ORDER_LINE_STATUSES = [
  "awaiting",
  "awaiting_approval",
  "in_progress",
  "on_hold",
  "completed",
  "ready_to_invoice",
  "invoiced",
] as const;

export type WorkOrderLineStatus =
  (typeof CANONICAL_WORK_ORDER_LINE_STATUSES)[number];

export const WORK_ORDER_LINE_ALLOWED_TRANSITIONS: Record<
  WorkOrderLineStatus,
  readonly WorkOrderLineStatus[]
> = {
  awaiting: ["awaiting_approval", "in_progress", "on_hold", "completed"],
  awaiting_approval: ["awaiting_approval", "in_progress", "on_hold", "completed"],
  in_progress: ["in_progress", "on_hold", "completed", "awaiting_approval"],
  on_hold: ["on_hold", "in_progress", "completed", "awaiting_approval"],
  completed: ["completed", "ready_to_invoice", "invoiced"],
  ready_to_invoice: ["ready_to_invoice", "invoiced"],
  invoiced: ["invoiced"],
} as const;

const LEGACY_TO_CANONICAL: Record<string, WorkOrderLineStatus> = {
  awaiting: "awaiting",
  awaiting_approval: "awaiting_approval",
  active: "in_progress",
  in_progress: "in_progress",
  on_hold: "on_hold",
  completed: "completed",
  ready_to_invoice: "ready_to_invoice",
  invoiced: "invoiced",
  queued: "in_progress",
  paused: "on_hold",
  declined: "on_hold",
  assigned: "in_progress",
  unassigned: "awaiting",
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

export function canTransitionWorkOrderLineStatus(
  from: unknown,
  to: unknown,
): boolean {
  const fromStatus = assertWorkOrderLineStatus(from);
  const toStatus = assertWorkOrderLineStatus(to);
  return WORK_ORDER_LINE_ALLOWED_TRANSITIONS[fromStatus].includes(toStatus);
}

export function getWorkOrderLineTransitionError(
  from: unknown,
  to: unknown,
): string {
  const fromStatus = assertWorkOrderLineStatus(from);
  const toStatus = assertWorkOrderLineStatus(to);
  return `Invalid line status transition: ${fromStatus} -> ${toStatus}`;
}
