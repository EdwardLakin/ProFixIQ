import { normalizeWorkOrderLineStatus, type WorkOrderLineStatus } from "@/features/work-orders/lib/line-status";

type DetailLine = {
  status?: string | null;
  approval_state?: string | null;
  hold_reason?: string | null;
  punched_in_at?: string | null;
  punched_out_at?: string | null;
  assigned_tech_id?: string | null;
  voided_at?: string | null;
  deleted_at?: string | null;
};

type DetailWorkOrder = {
  status?: string | null;
};

export type MobileDetailHeaderStatus =
  | "in_progress"
  | "awaiting_approval"
  | "waiting_parts"
  | "on_hold"
  | "assigned"
  | "awaiting"
  | "ready_to_invoice"
  | "invoiced"
  | "completed";

export type MobileDetailLineState =
  | "in_progress"
  | "awaiting_approval"
  | "waiting_parts"
  | "on_hold"
  | "assigned"
  | "awaiting"
  | "completed";

export type MobileDetailCounters = {
  in_progress: number;
  awaiting_approval: number;
  waiting_parts: number;
  on_hold: number;
  assigned: number;
  awaiting: number;
  completed: number;
};

export type MobileDetailOperationalState<TLine extends DetailLine> = {
  visibleLines: TLine[];
  lineStates: Map<TLine, MobileDetailLineState>;
  counters: MobileDetailCounters;
  headerStatus: MobileDetailHeaderStatus;
};

const ACTIONABLE_PARENT_STATUSES = new Set(["ready_to_invoice", "invoiced"]);

function normalizeRaw(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");
}

export function isMobileDetailVisibleLine(line: DetailLine): boolean {
  return !line.voided_at && !line.deleted_at;
}

export function isPartsWaitingAdvisory(line: DetailLine): boolean {
  const status = normalizeWorkOrderLineStatus(line.status);
  const holdReason = normalizeRaw(line.hold_reason);
  return status === "waiting_parts" || holdReason.includes("part") || holdReason.includes("quote");
}

function isLineInProgress(line: DetailLine, status: WorkOrderLineStatus): boolean {
  return status === "in_progress" || (Boolean(line.punched_in_at) && !line.punched_out_at);
}

export function deriveMobileDetailLineState(line: DetailLine): MobileDetailLineState {
  const status = normalizeWorkOrderLineStatus(line.status);
  const approval = normalizeRaw(line.approval_state);

  if (isLineInProgress(line, status)) return "in_progress";
  if (approval === "pending" || status === "awaiting_approval") return "awaiting_approval";
  if (status === "on_hold") return "on_hold";
  if (status === "waiting_parts" || isPartsWaitingAdvisory(line)) return "waiting_parts";
  if (status === "completed" || status === "ready_to_invoice" || status === "invoiced") return "completed";
  if (line.assigned_tech_id || status === "approved") return "assigned";
  return "awaiting";
}

export function deriveMobileDetailOperationalState<TLine extends DetailLine>(
  workOrder: DetailWorkOrder | null | undefined,
  lines: readonly TLine[],
): MobileDetailOperationalState<TLine> {
  const visibleLines = lines.filter(isMobileDetailVisibleLine);
  const counters: MobileDetailCounters = {
    in_progress: 0,
    awaiting_approval: 0,
    waiting_parts: 0,
    on_hold: 0,
    assigned: 0,
    awaiting: 0,
    completed: 0,
  };
  const lineStates = new Map<TLine, MobileDetailLineState>();

  for (const line of visibleLines) {
    const state = deriveMobileDetailLineState(line);
    lineStates.set(line, state);
    counters[state] += 1;
    if (isPartsWaitingAdvisory(line)) counters.waiting_parts += state === "waiting_parts" ? 0 : 1;
  }

  const parentStatus = normalizeRaw(workOrder?.status);
  let headerStatus: MobileDetailHeaderStatus;
  if (counters.in_progress > 0) headerStatus = "in_progress";
  else if (counters.on_hold > 0) headerStatus = "on_hold";
  else if (counters.awaiting_approval > 0) headerStatus = "awaiting_approval";
  else if (counters.waiting_parts > 0) headerStatus = "waiting_parts";
  else if (counters.assigned > 0) headerStatus = "assigned";
  else if (counters.awaiting > 0) headerStatus = "awaiting";
  else if (ACTIONABLE_PARENT_STATUSES.has(parentStatus)) headerStatus = parentStatus as "ready_to_invoice" | "invoiced";
  else headerStatus = "completed";

  return { visibleLines, lineStates, counters, headerStatus };
}

export function applyFetchedMobileDetailSnapshot<TWorkOrder, TLine>(args: {
  cachedWorkOrder: TWorkOrder | null;
  cachedLines: readonly TLine[];
  fetchedWorkOrder: TWorkOrder;
  fetchedLines: readonly TLine[];
}): { workOrder: TWorkOrder; lines: TLine[] } {
  void args.cachedWorkOrder;
  void args.cachedLines;
  return { workOrder: args.fetchedWorkOrder, lines: [...args.fetchedLines] };
}
