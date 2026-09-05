import "server-only";

import { normalizeWorkOrderLineStatus } from "@/features/work-orders/lib/line-status";
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

// message.reply is orthogonal to a work order/job line entirely (it's
// handled directly in chat.ts, before any job-line resolution here), so
// it's excluded the same way none/work.next already are.
type ExecutableAction = Exclude<
  TechnicianCopilotAction,
  { type: "none" | "work.next" | "message.reply" }
>;

type PreparableAction = Exclude<TechnicianCopilotAction, { type: "message.reply" }>;

export type PreparedTechnicianCopilotAction =
  | { kind: "none" }
  | { kind: "reply"; reply: string }
  | {
      kind: "execute";
      action: ExecutableAction;
      workOrder: TechnicianWorkCandidate;
      line: TechnicianWorkLine;
      /**
       * inspection.start only: the template resolved server-side (the model
       * never picks one). Threaded through the action.pending/completed
       * ledger via BoundTechnicianCopilotAction, the same way
       * job.parts.request threads workOrderId through.
       */
      templateId?: string | null;
    };

export type TechnicianCopilotActionResult = {
  ok: boolean;
  reply: string;
  eventLabel?: string;
  eventDetail?: string;
  /**
   * inspection.start only: tells the client which inspection to navigate
   * to. Every other action leaves this unset.
   */
  clientAction?: {
    workOrderId: string;
    workOrderLineId: string;
    templateId: string;
  } | null;
};

export function technicianWorkLineLabel(line: TechnicianWorkLine): string {
  return line.complaint ?? line.description ?? `job ${line.id.slice(0, 8)}`;
}

export function workOrderLabel(workOrder: TechnicianWorkCandidate): string {
  return workOrder.customId
    ? `WO #${workOrder.customId}`
    : `work order ${workOrder.id.slice(0, 8)}`;
}

export function statusLabel(value: string | null): string {
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

function findLineAcrossAssignedWork(
  assignedWork: readonly TechnicianWorkCandidate[],
  lineId: string,
): { workOrder: TechnicianWorkCandidate; line: TechnicianWorkLine } | null {
  for (const workOrder of assignedWork) {
    const line = workOrder.lines.find((candidate) => candidate.id === lineId);
    if (line) return { workOrder, line };
  }
  return null;
}

/**
 * A technician can only be actively punched into one job line at a time
 * (the shared job-action RPC already enforces this — see safeFailure's
 * "already punched into another job" case). Used to detect whether
 * starting a different line for an inspection needs to hold this one
 * first.
 */
function findInProgressLine(
  assignedWork: readonly TechnicianWorkCandidate[],
): { workOrder: TechnicianWorkCandidate; line: TechnicianWorkLine } | null {
  for (const workOrder of assignedWork) {
    const line = workOrder.lines.find(
      (candidate) => normalizeWorkOrderLineStatus(candidate.status) === "in_progress",
    );
    if (line) return { workOrder, line };
  }
  return null;
}

type InspectionTemplateLookupClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => PromiseLike<{
          data: { inspection_template_id: string | null } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

async function lookupInspectionTemplateId(
  supabase: TechnicianWorkScope["supabase"],
  lineId: string,
): Promise<string | null> {
  const client = supabase as unknown as InspectionTemplateLookupClient;
  const { data, error } = await client
    .from("work_order_lines")
    .select("inspection_template_id")
    .eq("id", lineId)
    .maybeSingle();
  if (error || !data) return null;
  const id = data.inspection_template_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

type InspectionStartTarget =
  | { kind: "reply"; reply: string }
  | {
      kind: "execute";
      workOrder: TechnicianWorkCandidate;
      line: TechnicianWorkLine;
      templateId: string;
    };

/**
 * Resolves inspection.start to either a plain reply (ambiguous line, no
 * template attached, or another job already in progress elsewhere) or a
 * concrete line + template to open. Searches across every assigned work
 * order, not just the currently active one — a standalone inspection line
 * (e.g. a CVIP) can live on a different work order than whatever the
 * technician is currently punched into.
 *
 * A technician can only be punched into one job at a time, and every
 * inspection needs a punch event first (see model.ts's inspection.start
 * guidance). Rather than silently holding whatever the technician is
 * already working on, this asks them to put it on hold or finish it
 * first — holding a job they didn't explicitly mention is a real state
 * change this shouldn't make unprompted.
 */
async function resolveInspectionStartTarget(input: {
  supabase: TechnicianWorkScope["supabase"];
  action: Extract<TechnicianCopilotAction, { type: "inspection.start" }>;
  assignedWork: readonly TechnicianWorkCandidate[];
}): Promise<InspectionStartTarget> {
  const requestedId = input.action.workOrderLineId;
  const target = requestedId
    ? findLineAcrossAssignedWork(input.assignedWork, requestedId)
    : null;

  if (!target) {
    const allLines = input.assignedWork.flatMap((workOrder) => workOrder.lines);
    if (allLines.length === 0) {
      return {
        kind: "reply",
        reply: "You don't have an assigned job line to inspect right now.",
      };
    }
    return { kind: "reply", reply: choiceReply(allLines) };
  }

  const { workOrder, line } = target;
  const label = technicianWorkLineLabel(line);
  const status = normalizeWorkOrderLineStatus(line.status);

  if (status !== "in_progress") {
    const conflicting = findInProgressLine(input.assignedWork);
    if (conflicting && conflicting.line.id !== line.id) {
      return {
        kind: "reply",
        reply: `You're currently working on ${technicianWorkLineLabel(conflicting.line)}. Put that on hold or finish it, then ask me to start ${label}.`,
      };
    }
  }

  const templateId = await lookupInspectionTemplateId(input.supabase, line.id);
  if (!templateId) {
    return {
      kind: "reply",
      reply: `${label} doesn't have an inspection template attached yet. Build or attach a custom inspection first.`,
    };
  }

  return { kind: "execute", workOrder, line, templateId };
}

export async function prepareTechnicianCopilotAction(input: {
  action: PreparableAction;
  activeWorkOrder: TechnicianWorkCandidate | null;
  assignedWork: readonly TechnicianWorkCandidate[];
  activeWorkOrderLineId: string | null;
  supabase: TechnicianWorkScope["supabase"];
}): Promise<PreparedTechnicianCopilotAction> {
  if (input.action.type === "none") return { kind: "none" };
  if (input.action.type === "work.next") {
    return {
      kind: "reply",
      reply: describeNextTechnicianWork(input.assignedWork),
    };
  }

  if (input.action.type === "inspection.start") {
    const target = await resolveInspectionStartTarget({
      supabase: input.supabase,
      action: input.action,
      assignedWork: input.assignedWork,
    });
    if (target.kind === "reply") return target;
    return {
      kind: "execute",
      action: { type: "inspection.start", workOrderLineId: target.line.id },
      workOrder: target.workOrder,
      line: target.line,
      templateId: target.templateId,
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
    input.action.type === "job.parts.request" &&
    input.action.items.length === 0
  ) {
    return {
      kind: "reply",
      reply: `What parts and quantities do you need for ${technicianWorkLineLabel(line)}?`,
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
  /**
   * Only required by actions whose execution needs the parent work order
   * directly (e.g. job.parts.request, which calls a work-order-scoped RPC
   * rather than the shared job-action command). Nullable because the
   * existing job.* actions resolve their work order from the line and have
   * never needed it threaded through here.
   */
  workOrderId?: string | null;
  /**
   * inspection.start only: the template resolved when the action was
   * prepared. See PreparedTechnicianCopilotAction's templateId doc.
   */
  templateId?: string | null;
};

type AdminRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: {
      message: string;
      details?: string | null;
      hint?: string | null;
    } | null;
  }>;
};

/**
 * Parts requests go through the same atomic, idempotent RPC the manual
 * "Request Parts" screen already submits to
 * (materialize_offline_parts_request_draft_atomic), not the shared
 * job-action command used by job.start/hold/complete. It's a different
 * mutation domain — creating a parts request, not transitioning job/punch
 * state — so it deliberately doesn't touch that shared state machine.
 * The RPC itself re-checks shop/work-order/assignment authorization
 * independent of this call.
 */
async function executePartsRequestAction(input: {
  identity: CopilotMutationIdentity;
  bound: BoundTechnicianCopilotAction;
  action: Extract<TechnicianCopilotAction, { type: "job.parts.request" }>;
  operationId: string;
}): Promise<TechnicianCopilotActionResult> {
  const label = input.bound.lineLabel;
  const workOrderId = input.bound.workOrderId;
  if (!workOrderId) {
    return {
      ok: false,
      reply: `I couldn't confirm the work order for ${label}. Refresh and try again.`,
    };
  }

  const payload = {
    notes: input.action.notes ?? "",
    items: input.action.items.map((item) => ({
      description: item.description,
      qty: item.qty,
      partNumber: null,
      manufacturer: null,
    })),
  };

  const rpc = input.identity.supabase as unknown as AdminRpcClient;
  const { error } = await rpc.rpc(
    "materialize_offline_parts_request_draft_atomic",
    {
      p_shop_id: input.identity.shopId,
      p_actor_user_id: input.identity.authUserId,
      p_operation_key: `copilot:${input.operationId}:parts-request`,
      p_work_order_id: workOrderId,
      p_work_order_line_id: input.bound.lineId,
      p_payload: payload,
    },
  );

  if (error) {
    console.error("[technician-copilot] parts request failed", {
      workOrderLineId: input.bound.lineId,
      error: error.message,
    });
    const message = error.message.toLowerCase();
    if (message.includes("not assigned")) {
      return {
        ok: false,
        reply: `You're not assigned to ${label}, so I can't request parts for it.`,
      };
    }
    if (message.includes("not found")) {
      return {
        ok: false,
        reply: `I couldn't find ${label} to attach that parts request to. Refresh and try again.`,
      };
    }
    return {
      ok: false,
      reply: `I couldn't submit that parts request for ${label}. Refresh and try again.`,
    };
  }

  const summary = input.action.items
    .map((item) => `${item.qty} ${item.description}`)
    .join(", ");
  return {
    ok: true,
    reply: `Requested ${summary} for ${label}.`,
    eventLabel: "Requested parts",
    eventDetail: `${label}: ${summary}`,
  };
}

/**
 * inspection.start reuses the exact job.start mutation (idempotent retry
 * included) to punch the technician into the target line, then hands the
 * client the resolved template to navigate to. resolveInspectionStartTarget
 * has already confirmed no *other* line is in progress before this ever
 * runs, so "already has active labor on this line" here means the
 * technician was already punched into this exact line (e.g. reopening the
 * inspection after a refresh) — that's success, not a conflict, and is
 * distinguished from "already has an active job punch" (a different line),
 * which is a real failure this shouldn't be able to reach given the
 * resolve-time check, but is handled safely regardless.
 */
async function executeInspectionStartAction(input: {
  identity: CopilotMutationIdentity;
  sessionId: string;
  bound: BoundTechnicianCopilotAction;
  operationId: string;
  expectedLineUpdatedAt?: string | null;
}): Promise<TechnicianCopilotActionResult> {
  const label = input.bound.lineLabel;
  const workOrderId = input.bound.workOrderId;
  const templateId = input.bound.templateId;
  if (!workOrderId || !templateId) {
    return {
      ok: false,
      reply: `I couldn't confirm the inspection template for ${label}. Refresh and try again.`,
    };
  }

  const startAction = { type: "job.start" as const, workOrderLineId: input.bound.lineId };
  const startCommand = {
    authUserId: input.identity.authUserId,
    profileId: input.identity.profileId,
    shopId: input.identity.shopId,
    action: "job.action" as const,
    args: {
      sessionId: input.sessionId,
      workOrderLineId: input.bound.lineId,
      jobAction: "job.start" as const,
      operationId: input.operationId,
      reason: null,
      cause: null,
      correction: null,
      expectedLineUpdatedAt:
        input.expectedLineUpdatedAt === undefined
          ? input.bound.lineUpdatedAt
          : input.expectedLineUpdatedAt,
    },
  };

  try {
    try {
      await sendCopilotServerCommand<Record<string, unknown>>(startCommand);
    } catch {
      await sendCopilotServerCommand<Record<string, unknown>>(startCommand);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("already has active labor on this line")) {
      console.error("[technician-copilot] inspection start punch failed", {
        workOrderLineId: input.bound.lineId,
        error: message,
      });
      return { ok: false, reply: safeFailure(startAction, message) };
    }
  }

  return {
    ok: true,
    reply: `Opening the inspection for ${label}.`,
    eventLabel: "Started inspection",
    eventDetail: label,
    clientAction: { workOrderId, workOrderLineId: input.bound.lineId, templateId },
  };
}

export async function executeBoundTechnicianCopilotAction(input: {
  identity: CopilotMutationIdentity;
  sessionId: string;
  bound: BoundTechnicianCopilotAction;
  operationId: string;
  expectedLineUpdatedAt?: string | null;
}): Promise<TechnicianCopilotActionResult> {
  const { action } = input.bound;

  if (action.type === "job.parts.request") {
    return executePartsRequestAction({
      identity: input.identity,
      bound: input.bound,
      action,
      operationId: input.operationId,
    });
  }

  if (action.type === "inspection.start") {
    return executeInspectionStartAction({
      identity: input.identity,
      sessionId: input.sessionId,
      bound: input.bound,
      operationId: input.operationId,
      expectedLineUpdatedAt: input.expectedLineUpdatedAt,
    });
  }

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
  const { action, line, workOrder, templateId } = input.prepared;
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
      workOrderId: workOrder.id,
      templateId,
    },
  });
}
