export const CANONICAL_WORK_ORDER_OPERATIONAL_STAGES = [
  "intake",
  "estimate",
  "awaiting_approval",
  "authorized",
  "waiting",
  "in_progress",
  "quality_check",
  "ready",
  "closed",
] as const;

export type WorkOrderOperationalStage =
  (typeof CANONICAL_WORK_ORDER_OPERATIONAL_STAGES)[number];

export const WORK_ORDER_OPERATIONAL_STAGE_LABELS: Record<
  WorkOrderOperationalStage,
  string
> = {
  intake: "Intake",
  estimate: "Estimate",
  awaiting_approval: "Awaiting approval",
  authorized: "Authorized",
  waiting: "Waiting",
  in_progress: "In progress",
  quality_check: "Quality check",
  ready: "Ready",
  closed: "Closed",
};

const LEGACY_STAGE_ALIASES: Record<string, WorkOrderOperationalStage> = {
  new: "intake",
  pending: "intake",
  awaiting: "intake",
  empty: "intake",
  intake: "intake",
  inspection: "estimate",
  awaiting_inspection: "estimate",
  recommended: "estimate",
  estimate: "estimate",
  quote_sent: "awaiting_approval",
  awaiting_approval: "awaiting_approval",
  approved: "authorized",
  authorized: "authorized",
  queued: "authorized",
  waiting: "waiting",
  waiting_parts: "waiting",
  on_hold: "waiting",
  paused: "waiting",
  planned: "waiting",
  active: "in_progress",
  in_progress: "in_progress",
  quality_check: "quality_check",
  ready_to_invoice: "ready",
  ready: "ready",
  invoiced: "closed",
  completed: "closed",
  done: "closed",
  cancelled: "closed",
  canceled: "closed",
  closed: "closed",
};

export function normalizeWorkOrderOperationalStage(
  value: unknown,
): WorkOrderOperationalStage {
  return parseWorkOrderOperationalStage(value) ?? "intake";
}

export function parseWorkOrderOperationalStage(
  value: unknown,
): WorkOrderOperationalStage | null {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
  return LEGACY_STAGE_ALIASES[key] ?? null;
}

export function workOrderOperationalStageProgress(
  stage: WorkOrderOperationalStage,
): number {
  const index = CANONICAL_WORK_ORDER_OPERATIONAL_STAGES.indexOf(stage);
  return Math.round((index / (CANONICAL_WORK_ORDER_OPERATIONAL_STAGES.length - 1)) * 100);
}

export type CustomerSafeWorkOrderStatus =
  | "received"
  | "reviewing"
  | "action_needed"
  | "scheduled"
  | "in_service"
  | "ready"
  | "closed";

export function toCustomerSafeWorkOrderStatus(
  stage: WorkOrderOperationalStage,
): CustomerSafeWorkOrderStatus {
  switch (stage) {
    case "intake":
      return "received";
    case "estimate":
      return "reviewing";
    case "awaiting_approval":
      return "action_needed";
    case "authorized":
    case "waiting":
      return "scheduled";
    case "in_progress":
    case "quality_check":
      return "in_service";
    case "ready":
      return "ready";
    case "closed":
      return "closed";
  }
}
