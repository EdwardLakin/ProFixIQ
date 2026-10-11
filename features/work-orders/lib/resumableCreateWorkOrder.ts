export type CreateResumeWorkOrder = {
  status?: string | null;
  approval_state?: string | null;
  estimate_sent_at?: string | null;
  source_fleet_service_request_id?: string | null;
  archived_at?: string | null;
  inspection_id?: string | null;
};

export type CreateResumeLine = {
  status?: string | null;
  line_status?: string | null;
  approval_state?: string | null;
  source_fleet_service_request_line_id?: string | null;
  assigned_tech_id?: string | null;
  assigned_to?: string | null;
  punched_in_at?: string | null;
  punched_out_at?: string | null;
  voided_at?: string | null;
};

// A work order is created as "awaiting", but the work_order_lines status
// trigger (private.reconcile_work_order_state) derives work_orders.status from
// its lines: the first line added during setup makes it "queued", and lines
// that are pending approval make it "awaiting_approval". Both are still setup
// while no technician, inspection, punch, line progress or customer decision
// exists, and those are checked below.
const RESUMABLE_WORK_ORDER_STATUSES = new Set([
  "awaiting",
  "new",
  "draft",
  "queued",
  "awaiting_approval",
]);
const DECIDED_APPROVAL_STATES = new Set(["approved", "partial", "declined"]);
const SETUP_LINE_STATUSES = new Set([
  "",
  "awaiting",
  "awaiting_approval",
  "pending",
  "unassigned",
  "deferred",
]);

function normalizeStatus(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
}

export function getCreateResumeBlocker(input: {
  workOrder: CreateResumeWorkOrder;
  lines?: CreateResumeLine[];
  hasBridgeAssignment?: boolean;
  hasInspection?: boolean;
  hasDeliveredQuote?: boolean;
}): string | null {
  const {
    workOrder,
    lines = [],
    hasBridgeAssignment = false,
    hasInspection = false,
    hasDeliveredQuote = false,
  } = input;
  const activeLines = lines.filter((line) => !line.voided_at);

  if (workOrder.archived_at) {
    return "Archived work orders cannot be continued from creation.";
  }
  if (!RESUMABLE_WORK_ORDER_STATUSES.has(normalizeStatus(workOrder.status))) {
    return "Only work orders still awaiting setup can be continued.";
  }
  if (
    workOrder.source_fleet_service_request_id ||
    activeLines.some((line) => line.source_fleet_service_request_line_id)
  ) {
    return "This work order came from a Fleet service request and must be edited through the Fleet handoff.";
  }
  if (workOrder.estimate_sent_at || hasDeliveredQuote) {
    return "An estimate has already been sent to the customer.";
  }
  if (
    DECIDED_APPROVAL_STATES.has(normalizeStatus(workOrder.approval_state)) ||
    activeLines.some((line) =>
      DECIDED_APPROVAL_STATES.has(normalizeStatus(line.approval_state)),
    )
  ) {
    return "A customer approval decision has already been recorded on this work order.";
  }
  if (workOrder.inspection_id || hasInspection) {
    return "This work order already has an inspection in progress.";
  }
  if (
    hasBridgeAssignment ||
    activeLines.some((line) => line.assigned_tech_id || line.assigned_to)
  ) {
    return "This work order has already been assigned to a technician.";
  }
  if (
    activeLines.some((line) => line.punched_in_at || line.punched_out_at)
  ) {
    return "Technician time has already been recorded on this work order.";
  }

  const progressedLine = activeLines.some((line) => {
    const lineStatus = normalizeStatus(line.line_status);
    const status = normalizeStatus(line.status);
    return (
      !SETUP_LINE_STATUSES.has(lineStatus) ||
      !SETUP_LINE_STATUSES.has(status)
    );
  });
  if (progressedLine) {
    return "Work has already progressed beyond creation setup.";
  }

  return null;
}

export function canResumeWorkOrderCreation(input: {
  workOrder: CreateResumeWorkOrder;
  lines?: CreateResumeLine[];
  hasBridgeAssignment?: boolean;
  hasInspection?: boolean;
  hasDeliveredQuote?: boolean;
}): boolean {
  return getCreateResumeBlocker(input) === null;
}
