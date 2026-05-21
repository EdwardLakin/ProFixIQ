export const CANONICAL_WORK_ORDER_STATUSES = [
  "new",
  "awaiting_inspection",
  "awaiting_approval",
  "approved",
  "in_progress",
  "waiting_parts",
  "ready_to_invoice",
  "invoiced",
  "completed",
  "cancelled",
] as const;

export type WorkOrderStatus = (typeof CANONICAL_WORK_ORDER_STATUSES)[number];

const LEGACY_TO_CANONICAL: Record<string, WorkOrderStatus> = {
  new: "new",
  queued: "new",
  pending: "new",
  awaiting_inspection: "awaiting_inspection",
  inspection: "awaiting_inspection",
  awaiting_approval: "awaiting_approval",
  quote_sent: "awaiting_approval",
  approved: "approved",
  in_progress: "in_progress",
  active: "in_progress",
  waiting_parts: "waiting_parts",
  on_hold: "waiting_parts",
  paused: "waiting_parts",
  ready_to_invoice: "ready_to_invoice",
  invoiced: "invoiced",
  completed: "completed",
  done: "completed",
  cancelled: "cancelled",
  canceled: "cancelled",
};

export function normalizeWorkOrderStatus(value: unknown): WorkOrderStatus {
  const key = String(value ?? "").trim().toLowerCase().replaceAll(" ", "_");
  return LEGACY_TO_CANONICAL[key] ?? "new";
}
