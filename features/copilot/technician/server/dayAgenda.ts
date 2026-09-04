import "server-only";

import { normalizeWorkOrderLineStatus } from "@/features/work-orders/lib/line-status";
import {
  compareTechnicianWorkLines,
  statusLabel,
  technicianWorkLineLabel,
  workOrderLabel,
} from "./actions";
import type { TechnicianWorkCandidate, TechnicianWorkLine } from "./assignedWork";

/**
 * A technician's full assigned queue, structured so it can be narrated as
 * "here's your day" instead of one line at a time. Built deterministically
 * from the same assigned-work data the reactive "what's next" path already
 * reads — no model call, so job facts here can never be invented.
 */
export type TechnicianDayAgendaItem = {
  workOrderId: string;
  workOrderLineId: string;
  workOrderLabel: string;
  lineLabel: string;
  status: string;
  statusLabel: string;
  holdReason: string | null;
  vehicle: string | null;
};

export type TechnicianDayAgenda = {
  items: TechnicianDayAgendaItem[];
  /** The line the technician is already punched into, if any. */
  activeItem: TechnicianDayAgendaItem | null;
  readyCount: number;
  inProgressCount: number;
  onHoldCount: number;
  waitingPartsCount: number;
  totalCount: number;
};

function vehicleLabel(workOrder: TechnicianWorkCandidate): string | null {
  const vehicle = [
    workOrder.vehicleYear,
    workOrder.vehicleMake,
    workOrder.vehicleModel,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  const unit = workOrder.vehicleUnitNumber
    ? `Unit ${workOrder.vehicleUnitNumber}`
    : null;
  const label = [vehicle || null, unit].filter(Boolean).join(" · ");
  return label || null;
}

function toAgendaItem(
  workOrder: TechnicianWorkCandidate,
  line: TechnicianWorkLine,
): TechnicianDayAgendaItem {
  return {
    workOrderId: workOrder.id,
    workOrderLineId: line.id,
    workOrderLabel: workOrderLabel(workOrder),
    lineLabel: technicianWorkLineLabel(line),
    status: normalizeWorkOrderLineStatus(line.status),
    statusLabel: statusLabel(line.status),
    holdReason: line.holdReason,
    vehicle: vehicleLabel(workOrder),
  };
}

export function buildTechnicianDayAgenda(
  assignedWork: readonly TechnicianWorkCandidate[],
): TechnicianDayAgenda {
  const pairs = assignedWork
    .flatMap((workOrder) =>
      workOrder.lines.map((line) => ({ workOrder, line })),
    )
    .sort((left, right) => compareTechnicianWorkLines(left.line, right.line));

  const items = pairs.map(({ workOrder, line }) => toAgendaItem(workOrder, line));

  let inProgressCount = 0;
  let onHoldCount = 0;
  let waitingPartsCount = 0;
  let readyCount = 0;
  for (const item of items) {
    if (item.status === "in_progress") inProgressCount += 1;
    else if (item.status === "on_hold") onHoldCount += 1;
    else if (item.status === "waiting_parts") waitingPartsCount += 1;
    else readyCount += 1;
  }

  return {
    items,
    activeItem: items.find((item) => item.status === "in_progress") ?? null,
    readyCount,
    inProgressCount,
    onHoldCount,
    waitingPartsCount,
    totalCount: items.length,
  };
}

function greetingSalutation(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Deterministic greeting text for the CoPilot's opening turn. This is not a
 * model call: every fact in it comes straight from buildTechnicianDayAgenda,
 * so the greeting can never state a job, vehicle, or count that isn't real.
 * The CoPilot's own reasoning only takes over once the technician replies.
 */
export function describeTechnicianDayAgenda(
  agenda: TechnicianDayAgenda,
  technicianName: string | null,
  now: Date = new Date(),
): string {
  const salutation = greetingSalutation(now);
  const name = technicianName?.trim();
  const greetingLine = name ? `${salutation}, ${name}.` : `${salutation}.`;

  if (agenda.totalCount === 0) {
    return `${greetingLine} You don't have any assigned jobs right now. Let me know if you want me to check for anything.`;
  }

  if (agenda.activeItem) {
    const active = agenda.activeItem;
    const remaining = agenda.totalCount - 1;
    const remainingLine =
      remaining > 0
        ? ` You have ${remaining} more line${remaining === 1 ? "" : "s"} queued up after that.`
        : "";
    const vehicleSuffix = active.vehicle ? ` (${active.vehicle})` : "";
    return `${greetingLine} You're already punched into ${active.lineLabel} on ${active.workOrderLabel}${vehicleSuffix}.${remainingLine} Want to keep going there, or talk through what's next?`;
  }

  const preview = agenda.items.slice(0, 3).map((item, index) => {
    const vehicle = item.vehicle ? ` on the ${item.vehicle}` : "";
    return `${index + 1}) ${item.lineLabel}${vehicle} — ${item.workOrderLabel}`;
  });

  const blockedParts: string[] = [];
  if (agenda.onHoldCount > 0) {
    blockedParts.push(`${agenda.onHoldCount} on hold`);
  }
  if (agenda.waitingPartsCount > 0) {
    blockedParts.push(`${agenda.waitingPartsCount} waiting on parts`);
  }
  const blockedLine = blockedParts.length ? ` ${blockedParts.join(" and ")}.` : "";

  const countLine = `You've got ${agenda.totalCount} job${agenda.totalCount === 1 ? "" : "s"} lined up today.${blockedLine}`;

  return [greetingLine, countLine, ...preview, "Where would you like to begin?"].join(
    "\n",
  );
}
