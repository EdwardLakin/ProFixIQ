import "server-only";

import { normalizeWorkOrderLineStatus } from "@/features/work-orders/lib/line-status";
import type { TechnicianCopilotAction } from "./actionContract";
import type {
  TechnicianWorkCandidate,
  TechnicianWorkLine,
} from "./assignedWork";
import { sendCopilotServerCommand } from "./transport";

type CopilotMutationIdentity = {
  authUserId: string;
  profileId: string;
  shopId: string;
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

function lineLabel(line: TechnicianWorkLine): string {
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
    .map((line) => lineLabel(line))
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

export function describeNextTechnicianWork(
  assignedWork: readonly TechnicianWorkCandidate[],
): string {
  const choices = assignedWork
    .flatMap((workOrder) =>
      workOrder.lines.map((line) => ({ workOrder, line })),
    )
    .sort((left, right) => {
      const rank = nextRank(left.line) - nextRank(right.line);
      if (rank !== 0) return rank;
      const priority =
        (left.line.priority ?? Number.MAX_SAFE_INTEGER) -
        (right.line.priority ?? Number.MAX_SAFE_INTEGER);
      if (priority !== 0) return priority;
      const createdAt = String(left.line.createdAt ?? "").localeCompare(
        String(right.line.createdAt ?? ""),
      );
      if (createdAt !== 0) return createdAt;
      return left.line.id.localeCompare(right.line.id);
    });

  const next = choices[0];
  if (!next) return "You don't have another assigned job line right now.";

  const label = lineLabel(next.line);
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
      reply: `What is the hold reason for ${lineLabel(line)}?`,
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
      reply: `${lineLabel(line)} is not currently on hold.`,
    };
  }

  if (input.action.type === "job.story.save") {
    if (!line.updatedAt) {
      return {
        kind: "reply",
        reply: `I couldn't verify the latest job story for ${lineLabel(line)}. Refresh the work order and try again.`,
      };
    }
    const cause = input.action.cause ?? line.cause;
    const correction = input.action.correction ?? line.correction;
    if (!cause && !correction) {
      return {
        kind: "reply",
        reply: `What cause or correction should I add to ${lineLabel(line)}?`,
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
          : "save the job story";
  return `I couldn't ${verb} because the job state changed. Review the line and try again.`;
}

export async function executeTechnicianCopilotAction(input: {
  identity: CopilotMutationIdentity;
  sessionId: string;
  prepared: Extract<PreparedTechnicianCopilotAction, { kind: "execute" }>;
  operationId: string;
  expectedLineUpdatedAt?: string | null;
}): Promise<TechnicianCopilotActionResult> {
  const { action, line } = input.prepared;
  try {
    await sendCopilotServerCommand<Record<string, unknown>>({
      authUserId: input.identity.authUserId,
      profileId: input.identity.profileId,
      shopId: input.identity.shopId,
      action: "job.action",
      args: {
        sessionId: input.sessionId,
        workOrderLineId: line.id,
        jobAction: action.type,
        operationId: input.operationId,
        reason: action.type === "job.hold" ? action.reason : null,
        cause: action.type === "job.story.save" ? action.cause : null,
        correction:
          action.type === "job.story.save" ? action.correction : null,
        expectedLineUpdatedAt:
          input.expectedLineUpdatedAt === undefined
            ? line.updatedAt
            : input.expectedLineUpdatedAt,
      },
    });
  } catch (error) {
    console.error("[technician-copilot] canonical job action failed", {
      action: action.type,
      workOrderLineId: line.id,
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

  const label = lineLabel(line);
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

  const saved = [
    action.cause !== line.cause ? "cause" : null,
    action.correction !== line.correction ? "correction" : null,
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
