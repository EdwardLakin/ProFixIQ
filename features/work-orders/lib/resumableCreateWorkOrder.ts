export type CreateResumeWorkOrder = {
  status?: string | null;
  archived_at?: string | null;
  inspection_id?: string | null;
};

export type CreateResumeLine = {
  status?: string | null;
  line_status?: string | null;
  assigned_tech_id?: string | null;
  assigned_to?: string | null;
  punched_in_at?: string | null;
  punched_out_at?: string | null;
  voided_at?: string | null;
};

const RESUMABLE_WORK_ORDER_STATUSES = new Set(["awaiting", "new", "draft"]);
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
}): string | null {
  const {
    workOrder,
    lines = [],
    hasBridgeAssignment = false,
    hasInspection = false,
  } = input;
  const activeLines = lines.filter((line) => !line.voided_at);

  if (workOrder.archived_at) {
    return "Archived work orders cannot be continued from creation.";
  }
  if (!RESUMABLE_WORK_ORDER_STATUSES.has(normalizeStatus(workOrder.status))) {
    return "Only work orders still awaiting setup can be continued.";
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
}): boolean {
  return getCreateResumeBlocker(input) === null;
}
