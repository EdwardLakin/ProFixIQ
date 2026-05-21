export const CANONICAL_WORK_ORDER_LINE_STATUSES = [
  "pending",
  "approved",
  "awaiting",
  "awaiting_approval",
  "in_progress",
  "waiting_parts",
  "on_hold",
  "completed",
  "ready_to_invoice",
  "invoiced",
  "declined",
  "deferred",
] as const;

export type WorkOrderLineStatus =
  (typeof CANONICAL_WORK_ORDER_LINE_STATUSES)[number];

export const WORK_ORDER_LINE_ALLOWED_TRANSITIONS: Record<
  WorkOrderLineStatus,
  readonly WorkOrderLineStatus[]
> = {
  pending: ["pending", "approved", "awaiting_approval", "in_progress", "waiting_parts", "declined", "deferred"],
  approved: ["approved", "in_progress", "waiting_parts", "completed", "declined", "deferred"],
  awaiting: ["awaiting", "awaiting_approval", "in_progress", "on_hold", "completed", "declined", "deferred"],
  awaiting_approval: ["awaiting_approval", "approved", "in_progress", "on_hold", "completed", "declined", "deferred"],
  in_progress: ["in_progress", "on_hold", "waiting_parts", "completed", "awaiting_approval", "declined", "deferred"],
  waiting_parts: ["waiting_parts", "in_progress", "completed", "declined", "deferred"],
  on_hold: ["on_hold", "in_progress", "waiting_parts", "completed", "awaiting_approval"],
  completed: ["completed", "ready_to_invoice", "invoiced"],
  ready_to_invoice: ["ready_to_invoice", "invoiced"],
  invoiced: ["invoiced"],
  declined: ["declined"],
  deferred: ["deferred"],
} as const;

const LEGACY_TO_CANONICAL: Record<string, WorkOrderLineStatus> = {
  pending: "pending",
  approved: "approved",
  awaiting: "awaiting",
  awaiting_approval: "awaiting_approval",
  active: "in_progress",
  in_progress: "in_progress",
  on_hold: "on_hold",
  waiting_parts: "waiting_parts",
  completed: "completed",
  ready_to_invoice: "ready_to_invoice",
  invoiced: "invoiced",
  queued: "in_progress",
  paused: "on_hold",
  declined: "declined",
  deferred: "deferred",
  assigned: "in_progress",
  unassigned: "awaiting",
  quoted: "awaiting_approval",
};

const CANONICAL_TO_DB_ALIASES: Record<WorkOrderLineStatus, readonly string[]> = {
  pending: ["pending"],
  approved: ["approved"],
  awaiting: ["awaiting", "unassigned"],
  awaiting_approval: ["awaiting_approval", "quoted"],
  in_progress: ["in_progress", "active", "queued", "assigned"],
  waiting_parts: ["waiting_parts"],
  on_hold: ["on_hold", "paused"],
  completed: ["completed"],
  ready_to_invoice: ["ready_to_invoice"],
  invoiced: ["invoiced"],
  declined: ["declined"],
  deferred: ["deferred"],
} as const;

export function getWorkOrderLineStatusDbFilter(statuses: readonly WorkOrderLineStatus[]): string[] {
  const out = new Set<string>();

  for (const status of statuses) {
    for (const alias of CANONICAL_TO_DB_ALIASES[status] ?? [status]) {
      out.add(alias);
    }
  }

  return [...out];
}

export function normalizeWorkOrderLineStatus(value: unknown): WorkOrderLineStatus {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");

  return LEGACY_TO_CANONICAL[key] ?? "pending";
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
