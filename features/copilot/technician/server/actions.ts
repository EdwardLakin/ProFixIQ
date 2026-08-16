import "server-only";

import { normalizeWorkOrderLineStatus } from "@/features/work-orders/lib/line-status";
import { learnFromCompletedWorkOrderLine } from "@/features/work-orders/server/completeWorkOrderLine";
import type { TechnicianCopilotAction } from "./actionContract";
import type {
  TechnicianWorkCandidate,
  TechnicianWorkLine,
  TechnicianWorkScope,
} from "./assignedWork";
import { sendCopilotServerCommand } from "./transport";

type CopilotMutationIdentity = {
  authUserId: string;
  profileId: string;
  shopId: string;
  supabase: TechnicianWorkScope["supabase"];
};

type ExecutableAction = Exclude<
  TechnicianCopilotAction,
  { type: "none" | "work.next" }
>;

export type PreparedTechnicianCopilotAction =
  | { kind: "none" }
  | { kind: "reply"; reply: string }
  | {
      kind: "execute";
      action: ExecutableAction;
      workOrder: TechnicianWorkCandidate;
      line: TechnicianWorkLine;
    };

export type TechnicianCopilotActionResult = {
  ok: boolean;
  reply: string;
  eventLabel?: string;
  eventDetail?: string;
};

export function technicianWorkLineLabel(line: TechnicianWorkLine): string {
  return line.complaint ?? line.description ?? `job ${line.id.slice(0, 8)}`;
}

function workOrderLabel(workOrder: TechnicianWorkCandidate): string {
  return workOrder.customId
    ? `WO #${workOrder.customId}`
    : `work order ${workOrder.id.slice(0, 8)}`;
}

function statusLabel(value: string | null): string {
  return normalizeWorkOrderLineStatus(value).replaceAll("_", " ");
}

function choiceReply(lines: readonly TechnicianWorkLine[]): string {
  const choices = lines
    .slice(0, 4)
    .map((line) => technicianWorkLineLabel(line))
    .join(", ");
  return `Which job line do you mean: ${choices}?`;
}

function resolveActionLine(input: {
  action: ExecutableAction;
  workOrder: TechnicianWorkCandidate;
  activeWorkOrderLineId: string | null;
}): TechnicianWorkLine | null {
  const requestedId = input.action.workOrderLineId;
  if (requestedId) {
    return input.workOrder.lines.find((line) => line.id === requestedId) ?? null;
  }

  if (input.activeWorkOrderLineId) {
    const active = input.workOrder.lines.find(
      (line) => line.id === input.activeWorkOrderLineId,
    );
    if (active) return active;
  }

  return input.workOrder.lines.length === 1 ? input.workOrder.lines[0] : null;
}

function nextRank(line: TechnicianWorkLine): number {
  const status = normalizeWorkOrderLineStatus(line.status);
  if (status === "in_progress") return 0;
  if (status === "approved" || status === "awaiting" || status === "pending") {
    return 1;
  }
  if (status === "on_hold") return 2;
  if (status === "waiting_parts") return 3;
  return 4;
}

export function compareTechnicianWorkLines(
  left: TechnicianWorkLine,
  right: TechnicianWorkLine,
): number {
  const rank = nextRank(left) - nextRank(right);
  if (rank !== 0) return rank;
  const priority =
    (left.priority ?? Number.MAX_SAFE_INTEGER) -
    (right.priority ?? Number.MAX_SAFE_INTEGER);
  if (priority !== 0) return priority;
  const createdAt = String(left.createdAt ?? "").localeCompare(
    String(right.createdAt ?? ""),
  );
  if (createdAt !== 0) return createdAt;
  return left.id.localeCompare(right.id);
}

export function selectNextTechnicianWorkLine(
  lines: readonly TechnicianWorkLine[],
): TechnicianWorkLine | null {
  return [...lines].sort(compareTechnicianWorkLines)[0] ?? null;
}

export function describeNextTechnicianWork(
  assignedWork: readonly TechnicianWorkCandidate[],
): string {
  const choices = assignedWork
    .flatMap((workOrder) =>
      workOrder.lines.map((line) => ({ workOrder, line })),
    )
    .sort((left, right) =>
      compareTechnicianWorkLines(left.line, right.line),
    );

  const next = choices[0];
  if (!next) return "You don't have another assigned job line right now.";

  const label = technicianWorkLineLabel(next.line);
  const order = workOrderLabel(next.workOrder);
  const status = normalizeWorkOrderLineStatus(next.line.status);
  if (status === "in_progress") {
    return `You're already punched into ${label} on ${order}. That's the next job to continue.`;
  }
  if (status === "on_hold" || status === "waiting_parts") {
    const reason = next.line.holdReason
      ? ` for ${next.line.holdReason}`
      : "";
    return `Your next assigned line is ${label} on ${order}, but it is ${statusLabel(next.line.status)}${reason}.`;
  }
  return `Next is ${label} on ${order}. It is ${statusLabel(next.line.status)} and ready for you.`;
}

export function prepareTechnicianCopilotAction(input: {
  action: TechnicianCopilotAction;
  activeWorkOrder: TechnicianWorkCandidate | null;
  assignedWork: readonly TechnicianWorkCandidate[];
  activeWorkOrderLineId: string | null;
}): PreparedTechnicianCopilotAction {
  if (input.action.type === "none") return { kind: "none" };
  if (input.action.type === "work.next") {
    return {
      kind: "reply",
      reply: describeNextTechnicianWork(input.assignedWork),
    };
  }

  const workOrder = input.activeWorkOrder;
  if (!workOrder) {
    return {
      kind: "reply",
      reply: "Select one of your assigned work orders first.",
    };
  }

  const line = resolveActionLine({
    action: input.action,
    workOrder,
    activeWorkOrderLineId: input.activeWorkOrderLineId,
  });
  if (!line) {
    if (input.action.workOrderLineId) {
      return {
        kind: "reply",
        reply:
          "That job line is no longer assigned and actionable for you. Ask what's next to refresh your queue.",
      };
    }
    return { kind: "reply", reply: choiceReply(workOrder.lines) };
  }

  if (input.action.type === "job.hold" && !input.action.reason) {
    return {
      kind: "reply",
      reply: `What is the hold reason for ${technicianWorkLineLabel(line)}?`,
    };
  }

  if (
    input.action.type === "job.release_hold" &&
    !["on_hold", "waiting_parts"].includes(
      normalizeWorkOrderLineStatus(line.status),
    )
  ) {
    return {
      kind: "reply",
      reply: `${technicianWorkLineLabel(line)} is not currently on hold.`,
    };
  }

  if (
    input.action.type === "job.story.save" ||
    input.action.type === "job.complete"
  ) {
    if (!line.updatedAt) {
      return {
        kind: "reply",
        reply: `I couldn't verify the latest job story for ${technicianWorkLineLabel(line)}. Refresh the work order and try again.`,
      };
    }
    const cause = input.action.cause ?? line.cause;
    const correction = input.action.correction ?? line.correction;
    if (
      input.action.type === "job.complete" &&
      normalizeWorkOrderLineStatus(line.status) !== "in_progress"
    ) {
      return {
        kind: "reply",
        reply: `Start ${technicianWorkLineLabel(line)} before completing it.`,
      };
    }
    if (input.action.type === "job.complete" && (!cause || !correction)) {
      const missing =
        !cause && !correction
          ? "cause and correction"
          : !cause
            ? "cause"
            : "correction";
      return {
        kind: "reply",
        reply: `What ${missing} should I record before completing ${technicianWorkLineLabel(line)}?`,
      };
    }
    if (!cause && !correction) {
      return {
        kind: "reply",
        reply: `What cause or correction should I add to ${technicianWorkLineLabel(line)}?`,
      };
    }
    return {
      kind: "execute",
      action: { ...input.action, cause, correction },
      workOrder,
      line,
    };
  }

  return { kind: "execute", action: input.action, workOrder, line };
}

function safeFailure(action: ExecutableAction, message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("shift_shop_mismatch")) {
    return "Your open shift belongs to another shop. End or correct that shift before starting this job.";
  }
  if (
    normalized.includes("active shift") ||
    normalized.includes("need an active shift")
  ) {
    return "You need to punch into your shift before I can start that job.";
  }
  if (
    normalized.includes("active job punch") ||
    normalized.includes("already has active labor")
  ) {
    return "You're already punched into another job. Put that line on hold or finish it first.";
  }
  if (normalized.includes("awaiting approval")) {
    return "That line is still awaiting approval, so it cannot be started yet.";
  }
  if (normalized.includes("financially_locked")) {
    return "That work order is financially locked and can no longer be changed.";
  }
  if (
    normalized.includes("line_version_conflict") ||
    normalized.includes("offline_version_conflict")
  ) {
    return "That job story changed on another device. Review the latest cause and correction, then try again.";
  }
  if (normalized.includes("cause is required")) {
    return "The cause is still required before I can complete that job.";
  }
  if (normalized.includes("correction is required")) {
    return "The correction is still required before I can complete that job.";
  }
  if (normalized.includes("labor time must be greater than 0")) {
    return "Labor time must be entered before I can complete that job.";
  }
  if (normalized.includes("inspection_completion_required")) {
    return "Complete and sign the inspection before I can finish that job.";
  }
  if (
    normalized.includes("copilot_job_not_active") ||
    normalized.includes("copilot_job_punch_not_active")
  ) {
    return "You need to be punched into that job before I can complete it.";
  }
  if (normalized.includes("other_technicians_still_punched_in")) {
    return "Another technician is still punched into that job, so I can't complete it yet.";
  }
  if (normalized.includes("job_not_on_hold")) {
    return "That job is no longer on hold. Review its current state before trying again.";
  }
  if (
    normalized.includes("not found") ||
    normalized.includes("not assigned") ||
    normalized.includes("not available") ||
    normalized.includes("assignment_required") ||
    normalized.includes("session_or_line_not_actionable")
  ) {
    return "That job line is no longer assigned and actionable for you.";
  }
  const verb =
    action.type === "job.start"
      ? "start the job"
      : action.type === "job.hold"
        ? "put the job on hold"
        : action.type === "job.release_hold"
          ? "release the hold"
          : action.type === "job.complete"
            ? "complete the job"
            : "save the job story";
  return `I couldn't confirm whether I could ${verb}. Refresh the job before trying again.`;
}

export type BoundTechnicianCopilotAction = {
  action: ExecutableAction;
  lineId: string;
  lineLabel: string;
  lineCause: string | null;
  lineCorrection: string | null;
  lineUpdatedAt: string | null;
};

export async function executeBoundTechnicianCopilotAction(input: {
  identity: CopilotMutationIdentity;
  sessionId: string;
  bound: BoundTechnicianCopilotAction;
  operationId: string;
  expectedLineUpdatedAt?: string | null;
}): Promise<TechnicianCopilotActionResult> {
  const { action } = input.bound;
  const command = {
    authUserId: input.identity.authUserId,
    profileId: input.identity.profileId,
    shopId: input.identity.shopId,
    action: "job.action" as const,
    args: {
      sessionId: input.sessionId,
      workOrderLineId: input.bound.lineId,
      jobAction: action.type,
      operationId: input.operationId,
      reason: action.type === "job.hold" ? action.reason : null,
      cause:
        action.type === "job.story.save" || action.type === "job.complete"
          ? action.cause
          : null,
      correction:
        action.type === "job.story.save" || action.type === "job.complete"
          ? action.correction
          : null,
      expectedLineUpdatedAt:
        input.expectedLineUpdatedAt === undefined
          ? input.bound.lineUpdatedAt
          : input.expectedLineUpdatedAt,
    },
  };

  try {
    try {
      await sendCopilotServerCommand<Record<string, unknown>>(command);
    } catch {
      // The action RPC is durably idempotent. Repeating the identical command
      // resolves an unknown HTTP outcome without duplicating the mutation.
      await sendCopilotServerCommand<Record<string, unknown>>(command);
    }
  } catch (error) {
    console.error("[technician-copilot] canonical job action failed", {
      action: action.type,
      workOrderLineId: input.bound.lineId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      reply: safeFailure(
        action,
        error instanceof Error ? error.message : String(error),
      ),
    };
  }

  if (action.type === "job.complete") {
    await learnFromCompletedWorkOrderLine({
      supabase: input.identity.supabase,
      lineId: input.bound.lineId,
      actorUserId: input.identity.authUserId,
      operationKey: input.operationId,
    });
  }

  const label = input.bound.lineLabel;
  if (action.type === "job.start") {
    return {
      ok: true,
      reply: `Started ${label}. Your job timer is running.`,
      eventLabel: "Started job",
      eventDetail: label,
    };
  }
  if (action.type === "job.hold") {
    return {
      ok: true,
      reply: `Put ${label} on hold for ${action.reason}.`,
      eventLabel: "Put job on hold",
      eventDetail: `${label}: ${action.reason}`,
    };
  }
  if (action.type === "job.release_hold") {
    return {
      ok: true,
      reply: `Released the hold on ${label}. It is back in awaiting.`,
      eventLabel: "Released job hold",
      eventDetail: label,
    };
  }
  if (action.type === "job.complete") {
    return {
      ok: true,
      reply: `Completed ${label} and stopped your job timer.`,
      eventLabel: "Completed job",
      eventDetail: label,
    };
  }

  const saved = [
    action.cause !== input.bound.lineCause ? "cause" : null,
    action.correction !== input.bound.lineCorrection ? "correction" : null,
  ]
    .filter(Boolean)
    .join(" and ");
  return {
    ok: true,
    reply: `Saved the ${saved || "job story"} for ${label}.`,
    eventLabel: "Saved job story",
    eventDetail: label,
  };
}

export async function executeTechnicianCopilotAction(input: {
  identity: CopilotMutationIdentity;
  sessionId: string;
  prepared: Extract<PreparedTechnicianCopilotAction, { kind: "execute" }>;
  operationId: string;
  expectedLineUpdatedAt?: string | null;
}): Promise<TechnicianCopilotActionResult> {
  const { action, line } = input.prepared;
  return executeBoundTechnicianCopilotAction({
    identity: input.identity,
    sessionId: input.sessionId,
    operationId: input.operationId,
    expectedLineUpdatedAt: input.expectedLineUpdatedAt,
    bound: {
      action,
      lineId: line.id,
      lineLabel: technicianWorkLineLabel(line),
      lineCause: line.cause,
      lineCorrection: line.correction,
      lineUpdatedAt: line.updatedAt,
    },
  });
}
