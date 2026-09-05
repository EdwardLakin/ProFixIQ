import "server-only";

import type {
  RepairSessionEvent,
  RepairSessionMode,
  RepairSessionStatus,
} from "../session/types";
import {
  dedupeDocumentationEvents,
  type SilentDocumentationEvent,
} from "../session/documentationFingerprint";
import { projectTechnicianContext } from "../session/projectTechnicianContext";
import {
  describeNextTechnicianWork,
  executeBoundTechnicianCopilotAction,
  prepareTechnicianCopilotAction,
  selectNextTechnicianWorkLine,
  technicianWorkLineLabel,
  type BoundTechnicianCopilotAction,
} from "./actions";
import {
  parseTechnicianCopilotAction,
  type TechnicianCopilotAction,
} from "./actionContract";
import {
  listTechnicianWorkCandidates,
  loadTechnicianWorkCandidateForWorkOrder,
  type TechnicianWorkCandidate,
  type TechnicianWorkScope,
} from "./assignedWork";
import { extractTechnicianDocumentationTurn } from "./documentation";
import { decideTechnicianCopilotTurn } from "./model";
import { deriveCopilotOperationId } from "./operationId";
import {
  sendCopilotServerCommand,
  type CopilotServerCommandAction,
} from "./transport";

export class TechnicianCopilotConflictError extends Error {
  readonly status = 409;

  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TechnicianCopilotConflictError";
  }
}

export type CopilotIdentity = {
  authUserId: string;
  profileId: string;
  shopId: string;
  documentationEnabled: boolean;
  voiceEnabled: boolean;
  supabase: TechnicianWorkScope["supabase"];
};

type Session = {
  id: string;
  workOrderId: string;
  activeWorkOrderLineId: string | null;
  mode: RepairSessionMode;
  status: RepairSessionStatus;
};

type Envelope = {
  session: Session | null;
  events: RepairSessionEvent[];
  documentationTurns?: string[];
};

type TechnicianTurnSource = "ui" | "voice";

function command<T>(
  identity: CopilotIdentity,
  action: CopilotServerCommandAction,
  args: Record<string, unknown>,
) {
  return sendCopilotServerCommand<T>({
    authUserId: identity.authUserId,
    profileId: identity.profileId,
    shopId: identity.shopId,
    action,
    args,
  });
}

function read(identity: CopilotIdentity, sessionId?: string | null) {
  return command<Envelope>(identity, "session.read", {
    sessionId: sessionId ?? null,
  });
}

function candidateFor(
  candidates: TechnicianWorkCandidate[],
  id: string | null | undefined,
) {
  return id
    ? (candidates.find((candidate) => candidate.id === id) ?? null)
    : null;
}

async function candidateForSession(
  identity: CopilotIdentity,
  session: Session,
  discovered: TechnicianWorkCandidate[],
): Promise<TechnicianWorkCandidate | null> {
  const discoveredCandidate = candidateFor(discovered, session.workOrderId);
  if (discoveredCandidate) return discoveredCandidate;

  return loadTechnicianWorkCandidateForWorkOrder({
    supabase: identity.supabase,
    shopId: identity.shopId,
    technicianIds: [identity.authUserId, identity.profileId],
    workOrderId: session.workOrderId,
  });
}

function complaintFor(
  candidate: TechnicianWorkCandidate | null,
): string | null {
  if (!candidate) return null;
  const values = [candidate.concern, ...candidate.lineComplaints]
    .map((value) => value?.trim())
    .filter(Boolean) as string[];
  return values.length ? [...new Set(values)].join(" | ") : null;
}

function storedTurnSource(event: RepairSessionEvent): TechnicianTurnSource {
  return event.payload?.inputMode === "voice" ? "voice" : "ui";
}

function storedTurnText(event: RepairSessionEvent): string {
  return typeof event.payload?.text === "string"
    ? event.payload.text.trim()
    : "";
}

type StoredActionTurn = {
  action: BoundTechnicianCopilotAction["action"];
  key: string;
  workOrderId: string | null;
  workOrderLineId: string | null;
  lineLabel: string | null;
  lineCause: string | null;
  lineCorrection: string | null;
  lineUpdatedAt: string | null;
  result: {
    ok: boolean;
    reply: string;
    eventLabel: string | null;
    eventDetail: string | null;
  } | null;
};

function storedActionTurn(
  events: readonly RepairSessionEvent[],
  turnId: string,
): StoredActionTurn | null {
  const pending = events.find(
    (event) =>
      event.eventType === "action.pending" && event.payload?.turnId === turnId,
  );
  if (!pending) return null;

  const action = parseTechnicianCopilotAction(pending.payload?.request);
  const key =
    typeof pending.payload?.key === "string" ? pending.payload.key.trim() : "";
  if (action.type === "none" || action.type === "work.next" || !key) {
    return null;
  }

  const completed = events.find(
    (event) =>
      event.eventType === "action.completed" &&
      event.payload?.turnId === turnId &&
      event.payload?.key === key,
  );
  const completedReply =
    typeof completed?.payload?.reply === "string"
      ? completed.payload.reply.trim()
      : "";

  return {
    action,
    key,
    workOrderId:
      typeof pending.payload?.workOrderId === "string"
        ? pending.payload.workOrderId
        : null,
    workOrderLineId:
      typeof pending.payload?.workOrderLineId === "string"
        ? pending.payload.workOrderLineId
        : null,
    lineLabel:
      typeof pending.payload?.lineLabel === "string"
        ? pending.payload.lineLabel
        : null,
    lineCause:
      typeof pending.payload?.lineCause === "string"
        ? pending.payload.lineCause
        : null,
    lineCorrection:
      typeof pending.payload?.lineCorrection === "string"
        ? pending.payload.lineCorrection
        : null,
    lineUpdatedAt:
      typeof pending.payload?.lineUpdatedAt === "string"
        ? pending.payload.lineUpdatedAt
        : null,
    result:
      completed && completedReply
        ? {
            ok: completed.payload?.ok === true,
            reply: completedReply,
            eventLabel:
              typeof completed.payload?.eventLabel === "string"
                ? completed.payload.eventLabel
                : null,
            eventDetail:
              typeof completed.payload?.eventDetail === "string"
                ? completed.payload.eventDetail
                : null,
          }
        : null,
  };
}

function isStoredCompletion(
  storedAction: StoredActionTurn | null,
): storedAction is StoredActionTurn & {
  action: Extract<TechnicianCopilotAction, { type: "job.complete" }>;
} {
  return storedAction?.action.type === "job.complete";
}

function boundActionFromStored(
  storedAction: StoredActionTurn,
): BoundTechnicianCopilotAction | null {
  if (!storedAction.workOrderLineId) return null;
  return {
    action: storedAction.action,
    lineId: storedAction.workOrderLineId,
    lineLabel:
      storedAction.lineLabel ??
      `job ${storedAction.workOrderLineId.slice(0, 8)}`,
    lineCause: storedAction.lineCause,
    lineCorrection: storedAction.lineCorrection,
    lineUpdatedAt: storedAction.lineUpdatedAt,
    workOrderId: storedAction.workOrderId,
  };
}

function assertActiveSession(
  session: Session | null,
): asserts session is Session {
  if (!session || session.status !== "active") {
    throw new TechnicianCopilotConflictError(
      "technician_copilot_session_stale",
      "This CoPilot tab is no longer the active repair session. Reload before continuing.",
    );
  }
}

function bindTurnToPersistedInput(input: {
  envelope: Envelope;
  turnId: string;
  requestedMessage: string;
  requestedSource: TechnicianTurnSource;
}): { message: string; source: TechnicianTurnSource; alreadyStored: boolean } {
  const stored = input.envelope.events.find(
    (event) =>
      event.eventType === "conversation.user" &&
      event.payload?.turnId === input.turnId,
  );
  if (!stored) {
    return {
      message: input.requestedMessage,
      source: input.requestedSource,
      alreadyStored: false,
    };
  }

  const persistedMessage = storedTurnText(stored);
  const persistedSource = storedTurnSource(stored);
  if (
    !persistedMessage ||
    persistedMessage !== input.requestedMessage ||
    persistedSource !== input.requestedSource
  ) {
    throw new TechnicianCopilotConflictError(
      "technician_copilot_turn_conflict",
      "This CoPilot turn ID is already bound to different input.",
    );
  }

  return {
    message: persistedMessage,
    source: persistedSource,
    alreadyStored: true,
  };
}

async function append(
  identity: CopilotIdentity,
  input: {
    sessionId: string;
    eventType: string;
    turnId: string;
    suffix: string;
    origin: "ui" | "voice" | "copilot" | "system";
    details: Record<string, unknown>;
  },
) {
  return command(identity, "event.append", {
    sessionId: input.sessionId,
    eventType: input.eventType,
    origin: input.origin,
    operationId: deriveCopilotOperationId(input.turnId, input.suffix),
    details: input.details,
    occurredAt: new Date().toISOString(),
  });
}

async function appendDocumentationTurn(
  identity: CopilotIdentity,
  input: {
    sessionId: string;
    turnId: string;
    events: SilentDocumentationEvent[];
  },
) {
  return command<{
    turnId: string;
    sourceTurnId: string;
    eventCount: number;
    replayed: boolean;
  }>(identity, "documentation.append", {
    sessionId: input.sessionId,
    sourceTurnId: input.turnId,
    operationId: deriveCopilotOperationId(input.turnId, "documentation-turn"),
    events: input.events,
    occurredAt: new Date().toISOString(),
  });
}

async function extractDocumentation(input: {
  enabled: boolean;
  message: string;
  turnId: string;
  context: ReturnType<typeof projectTechnicianContext>;
  workOrder: TechnicianWorkCandidate | null;
}): Promise<{ events: SilentDocumentationEvent[]; completed: boolean }> {
  if (!input.enabled) return { events: [], completed: false };
  try {
    const extraction = await extractTechnicianDocumentationTurn({
      message: input.message,
      turnId: input.turnId,
      workOrder: input.workOrder,
      repairContext: input.context,
    });
    return {
      completed: true,
      events: extraction.events.map((event) => ({
        type: event.type,
        details: {
          ...event.details,
          sourceTurnId: input.turnId,
          sourceText: input.message,
          captureMode: "silent_documentation_v1",
          captureModel: extraction.model,
          capturePromptVersion: extraction.promptVersion,
          captureProviderMode: extraction.providerMode,
        },
      })),
    };
  } catch (error) {
    console.error("[technician-copilot] silent documentation failed", {
      turnId: input.turnId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { events: [], completed: false };
  }
}

export async function runTechnicianCopilotTurn(input: {
  identity: CopilotIdentity;
  message: string;
  turnId: string;
  sessionId?: string | null;
  inputSource?: TechnicianTurnSource;
  requiredWorkOrderId?: string | null;
  requiredWorkOrderLineId?: string | null;
  requiredWorkOrderLineUpdatedAt?: string | null;
}) {
  const requestedMessage = input.message.trim();
  const inputSource: TechnicianTurnSource =
    input.inputSource === "voice" ? "voice" : "ui";
  if (inputSource === "voice" && !input.identity.voiceEnabled) {
    throw new Error("Technician CoPilot voice is not enabled.");
  }

  const capabilities = {
    documentation: input.identity.documentationEnabled,
    voice: input.identity.voiceEnabled,
  };

  const candidates = await listTechnicianWorkCandidates({
    supabase: input.identity.supabase,
    shopId: input.identity.shopId,
    technicianIds: [input.identity.authUserId, input.identity.profileId],
  });
  const requiredWorkOrder = input.requiredWorkOrderId
    ? candidateFor(candidates, input.requiredWorkOrderId)
    : null;
  const requiredLine = input.requiredWorkOrderLineId
    ? (requiredWorkOrder?.lines.find(
        (line) => line.id === input.requiredWorkOrderLineId,
      ) ?? null)
    : null;
  let envelope = await read(input.identity, input.sessionId);
  if (input.sessionId && !envelope.session) {
    throw new TechnicianCopilotConflictError(
      "technician_copilot_session_stale",
      "This CoPilot tab no longer owns an active repair session. Reload before continuing.",
    );
  }

  const initialStoredAction = storedActionTurn(envelope.events, input.turnId);
  if (
    initialStoredAction &&
    ((input.requiredWorkOrderId &&
      initialStoredAction.workOrderId !== input.requiredWorkOrderId) ||
      (input.requiredWorkOrderLineId &&
        initialStoredAction.workOrderLineId !== input.requiredWorkOrderLineId))
  ) {
    throw new TechnicianCopilotConflictError(
      "technician_copilot_confirmed_target_conflict",
      "This confirmed CoPilot action is bound to a different work order or job line.",
    );
  }
  if (
    !initialStoredAction &&
    ((input.requiredWorkOrderId && !requiredWorkOrder) ||
      (input.requiredWorkOrderLineId && !requiredLine))
  ) {
    throw new TechnicianCopilotConflictError(
      "technician_copilot_confirmed_target_stale",
      "The confirmed work order or job line is no longer assigned and actionable.",
    );
  }
  if (
    !initialStoredAction &&
    requiredLine &&
    input.requiredWorkOrderLineUpdatedAt &&
    ((requiredLine.updatedAt == null &&
      input.requiredWorkOrderLineUpdatedAt !== "missing") ||
      (requiredLine.updatedAt != null &&
        (input.requiredWorkOrderLineUpdatedAt === "missing" ||
          new Date(requiredLine.updatedAt).getTime() !==
            new Date(input.requiredWorkOrderLineUpdatedAt).getTime())))
  ) {
    throw new TechnicianCopilotConflictError(
      "technician_copilot_confirmed_target_stale",
      "The assigned job changed after confirmation. Review its current state and ask again.",
    );
  }

  if (requiredWorkOrder && requiredLine && !initialStoredAction) {
    const initialContext = envelope.session
      ? projectTechnicianContext({
          repairSessionId: envelope.session.id,
          mode: envelope.session.mode,
          status: envelope.session.status,
          events: envelope.events,
        })
      : null;
    const closedCompletionReplay = Boolean(
      envelope.session?.status === "closed" &&
      initialContext?.conversation.some(
        (turn) => turn.turnId === input.turnId && turn.role === "assistant",
      ) &&
      isStoredCompletion(initialStoredAction),
    );
    if (
      !closedCompletionReplay &&
      (envelope.session?.status !== "active" ||
        envelope.session.workOrderId !== requiredWorkOrder.id ||
        envelope.session.activeWorkOrderLineId !== requiredLine.id)
    ) {
      const anchored = await command<{ sessionId: string }>(
        input.identity,
        "session.start",
        {
          workOrderId: requiredWorkOrder.id,
          workOrderLineId: requiredLine.id,
          mode: "shop",
          operationId: deriveCopilotOperationId(
            input.turnId,
            "confirmed-target-anchor",
          ),
        },
      );
      envelope = await read(input.identity, anchored.sessionId);
      assertActiveSession(envelope.session);
    }
  }

  let context = envelope.session
    ? projectTechnicianContext({
        repairSessionId: envelope.session.id,
        mode: envelope.session.mode,
        status: envelope.session.status,
        events: envelope.events,
      })
    : null;
  let boundTurn = bindTurnToPersistedInput({
    envelope,
    turnId: input.turnId,
    requestedMessage,
    requestedSource: inputSource,
  });
  let existingAssistant = context?.conversation.find(
    (turn) => turn.turnId === input.turnId && turn.role === "assistant",
  );
  let documentationAlreadyFinalized =
    envelope.documentationTurns?.includes(input.turnId) ?? false;
  let storedAction = storedActionTurn(envelope.events, input.turnId);
  let activeWorkOrder =
    envelope.session?.status === "active"
      ? await candidateForSession(input.identity, envelope.session, candidates)
      : null;

  if (envelope.session?.status === "closed") {
    if (existingAssistant && isStoredCompletion(storedAction)) {
      return {
        sessionId: null,
        session: null,
        reply: existingAssistant.text,
        context,
        workOrder: null,
        capabilities,
        replayed: true,
      };
    }
    throw new TechnicianCopilotConflictError(
      "technician_copilot_session_stale",
      "This CoPilot repair session is closed. Start from your current assigned work.",
    );
  }

  if (envelope.session) assertActiveSession(envelope.session);
  if (
    envelope.session &&
    !activeWorkOrder &&
    !isStoredCompletion(storedAction)
  ) {
    throw new TechnicianCopilotConflictError(
      "technician_copilot_work_not_actionable",
      "The active CoPilot work order is no longer assigned and actionable.",
    );
  }

  if (
    existingAssistant &&
    envelope.session &&
    (!input.identity.documentationEnabled || documentationAlreadyFinalized) &&
    !(isStoredCompletion(storedAction) && storedAction.result?.ok)
  ) {
    return {
      sessionId: envelope.session.id,
      session: envelope.session,
      reply: existingAssistant.text,
      context,
      workOrder: activeWorkOrder,
      capabilities,
      replayed: true,
    };
  }

  if (!envelope.session) {
    const decision = await decideTechnicianCopilotTurn({
      message: requestedMessage,
      activeSession: null,
      assignedWork: candidates,
    });
    if (decision.action?.type === "work.next") {
      return {
        sessionId: null,
        reply: describeNextTechnicianWork(candidates),
        context: null,
        workOrder: null,
        capabilities,
        replayed: false,
      };
    }
    const selected =
      decision.mode === "start"
        ? candidateFor(candidates, decision.workOrderId)
        : null;
    if (!selected) {
      const prepared = prepareTechnicianCopilotAction({
        action: decision.action ?? { type: "none" },
        activeWorkOrder: null,
        assignedWork: candidates,
        activeWorkOrderLineId: null,
      });
      return {
        sessionId: null,
        reply: prepared.kind === "reply" ? prepared.reply : decision.reply,
        context: null,
        workOrder: null,
        capabilities,
        replayed: false,
      };
    }

    const lineId =
      decision.workOrderLineId &&
      selected.lineIds.includes(decision.workOrderLineId)
        ? decision.workOrderLineId
        : selected.lineIds.length === 1
          ? selected.lineIds[0]
          : null;
    const started = await command<{ sessionId: string }>(
      input.identity,
      "session.start",
      {
        workOrderId: selected.id,
        workOrderLineId: lineId,
        mode: "shop",
        operationId: deriveCopilotOperationId(input.turnId, "session-start"),
      },
    );
    envelope = await read(input.identity, started.sessionId);
    assertActiveSession(envelope.session);
    activeWorkOrder = await candidateForSession(
      input.identity,
      envelope.session,
      candidates,
    );
    if (!activeWorkOrder) {
      throw new TechnicianCopilotConflictError(
        "technician_copilot_work_not_actionable",
        "The selected CoPilot work order is no longer assigned and actionable.",
      );
    }
    context = projectTechnicianContext({
      repairSessionId: envelope.session.id,
      mode: envelope.session.mode,
      status: envelope.session.status,
      events: envelope.events,
    });
    boundTurn = bindTurnToPersistedInput({
      envelope,
      turnId: input.turnId,
      requestedMessage,
      requestedSource: inputSource,
    });
    existingAssistant = context.conversation.find(
      (turn) => turn.turnId === input.turnId && turn.role === "assistant",
    );
    documentationAlreadyFinalized =
      envelope.documentationTurns?.includes(input.turnId) ?? false;
  }

  const session = envelope.session;
  assertActiveSession(session);

  if (!boundTurn.alreadyStored) {
    await append(input.identity, {
      sessionId: session.id,
      eventType: "conversation.user",
      turnId: input.turnId,
      suffix: "user",
      origin: inputSource,
      details: {
        text: boundTurn.message,
        turnId: input.turnId,
        inputMode: inputSource,
      },
    });
  }

  const existingComplaint = complaintFor(activeWorkOrder);
  if (
    existingComplaint &&
    !envelope.events.some((event) => event.eventType === "complaint.recorded")
  ) {
    await append(input.identity, {
      sessionId: session.id,
      eventType: "complaint.recorded",
      turnId: input.turnId,
      suffix: "canonical-complaint",
      origin: "system",
      details: { text: existingComplaint, source: "work_order" },
    });
  }

  envelope = await read(input.identity, session.id);
  assertActiveSession(envelope.session);
  context = projectTechnicianContext({
    repairSessionId: session.id,
    mode: session.mode,
    status: session.status,
    events: envelope.events,
  });
  if (!context) {
    throw new TechnicianCopilotConflictError(
      "technician_copilot_session_stale",
      "The active CoPilot context could not be restored. Reload before continuing.",
    );
  }

  storedAction = storedActionTurn(envelope.events, input.turnId);
  if (
    storedAction &&
    ((input.requiredWorkOrderId &&
      storedAction.workOrderId !== input.requiredWorkOrderId) ||
      (input.requiredWorkOrderLineId &&
        storedAction.workOrderLineId !== input.requiredWorkOrderLineId))
  ) {
    throw new TechnicianCopilotConflictError(
      "technician_copilot_confirmed_target_conflict",
      "This confirmed CoPilot action is bound to a different work order or job line.",
    );
  }
  let replayedActionResult = Boolean(storedAction?.result);
  let completionNeedsDisposition =
    isStoredCompletion(storedAction) && storedAction.result?.ok === true;
  const decisionPromise =
    existingAssistant || storedAction?.result || storedAction
      ? Promise.resolve(null)
      : decideTechnicianCopilotTurn({
          message: boundTurn.message,
          activeSession: {
            id: session.id,
            workOrderId: session.workOrderId,
            activeWorkOrderLineId: session.activeWorkOrderLineId,
          },
          assignedWork: candidates,
          workOrder: activeWorkOrder,
          repairContext: context,
        });
  const [decision, documentationExtraction] = await Promise.all([
    decisionPromise,
    extractDocumentation({
      enabled: input.identity.documentationEnabled,
      message: boundTurn.message,
      turnId: input.turnId,
      context,
      workOrder: activeWorkOrder,
    }),
  ]);

  const documentationEvents = dedupeDocumentationEvents(
    envelope.events,
    documentationExtraction.events,
  );
  if (
    input.identity.documentationEnabled &&
    !documentationAlreadyFinalized &&
    documentationExtraction.completed
  ) {
    try {
      await appendDocumentationTurn(input.identity, {
        sessionId: session.id,
        turnId: input.turnId,
        events: documentationEvents,
      });
      documentationAlreadyFinalized = true;
    } catch (error) {
      console.error(
        "[technician-copilot] silent documentation persistence failed",
        {
          turnId: input.turnId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  let reply =
    existingAssistant?.text ??
    storedAction?.result?.reply ??
    decision?.reply ??
    "I'm with you.";
  if (!existingAssistant && !storedAction?.result) {
    let actionKey =
      storedAction?.key ??
      deriveCopilotOperationId(input.turnId, "canonical-action");
    let actionWorkOrderId = storedAction?.workOrderId ?? session.workOrderId;
    let boundAction = storedAction ? boundActionFromStored(storedAction) : null;

    if (!storedAction) {
      const prepared = prepareTechnicianCopilotAction({
        action: decision?.action ?? { type: "none" },
        activeWorkOrder,
        assignedWork: candidates,
        activeWorkOrderLineId: session.activeWorkOrderLineId,
      });

      if (prepared.kind === "reply") {
        reply = prepared.reply;
      } else if (prepared.kind === "execute") {
        if (
          (input.requiredWorkOrderId &&
            prepared.workOrder.id !== input.requiredWorkOrderId) ||
          (input.requiredWorkOrderLineId &&
            prepared.line.id !== input.requiredWorkOrderLineId)
        ) {
          throw new TechnicianCopilotConflictError(
            "technician_copilot_confirmed_target_conflict",
            "The interpreted CoPilot action did not match the exact job shown for confirmation.",
          );
        }
        actionWorkOrderId = prepared.workOrder.id;
        await append(input.identity, {
          sessionId: session.id,
          eventType: "action.pending",
          turnId: input.turnId,
          suffix: "canonical-action-pending",
          origin: "system",
          details: {
            action: prepared.action.type,
            key: actionKey,
            turnId: input.turnId,
            request: prepared.action,
            workOrderId: prepared.workOrder.id,
            workOrderLineId: prepared.line.id,
            lineLabel: technicianWorkLineLabel(prepared.line),
            lineCause: prepared.line.cause,
            lineCorrection: prepared.line.correction,
            lineUpdatedAt: prepared.line.updatedAt,
          },
        });

        const bindingEnvelope = await read(input.identity, session.id);
        assertActiveSession(bindingEnvelope.session);
        storedAction = storedActionTurn(bindingEnvelope.events, input.turnId);
        if (!storedAction) {
          throw new TechnicianCopilotConflictError(
            "technician_copilot_action_binding_failed",
            "The spoken action could not be bound safely. Try that request again.",
          );
        }
        actionKey = storedAction.key;
        actionWorkOrderId = storedAction.workOrderId ?? actionWorkOrderId;
        if (storedAction.result) {
          reply = storedAction.result.reply;
          replayedActionResult = true;
        } else {
          boundAction = boundActionFromStored(storedAction);
        }
      }
    }

    if (storedAction && !boundAction && !storedAction.result) {
      reply =
        "That persisted job action is missing its line binding. Try a new request.";
      await append(input.identity, {
        sessionId: session.id,
        eventType: "action.completed",
        turnId: input.turnId,
        suffix: "canonical-action-result",
        origin: "system",
        details: {
          action: `Attempted ${storedAction.action.type}`,
          key: actionKey,
          turnId: input.turnId,
          ok: false,
          reply,
          tool: storedAction.action.type,
        },
      });
    }

    if (boundAction) {
      if (
        activeWorkOrder?.lines.some((line) => line.id === boundAction.lineId) &&
        session.activeWorkOrderLineId !== boundAction.lineId
      ) {
        await command<{ sessionId: string }>(input.identity, "session.start", {
          workOrderId: actionWorkOrderId,
          workOrderLineId: boundAction.lineId,
          mode: session.mode,
          operationId: deriveCopilotOperationId(
            input.turnId,
            "action-line-anchor",
          ),
        });
        session.activeWorkOrderLineId = boundAction.lineId;
      }

      const actionResult = await executeBoundTechnicianCopilotAction({
        identity: input.identity,
        sessionId: session.id,
        bound: boundAction,
        operationId: actionKey,
        expectedLineUpdatedAt: storedAction?.lineUpdatedAt,
      });
      reply = actionResult.reply;

      await append(input.identity, {
        sessionId: session.id,
        eventType: "action.completed",
        turnId: input.turnId,
        suffix: "canonical-action-result",
        origin: "system",
        details: {
          action:
            actionResult.eventLabel ?? `Attempted ${boundAction.action.type}`,
          key: actionKey,
          turnId: input.turnId,
          ok: actionResult.ok,
          reply,
          eventLabel: actionResult.eventLabel,
          eventDetail: actionResult.eventDetail,
          detail: actionResult.eventDetail,
          tool: boundAction.action.type,
          workOrderId: actionWorkOrderId,
          workOrderLineId: boundAction.lineId,
        },
      });

      if (actionResult.ok) {
        activeWorkOrder = await loadTechnicianWorkCandidateForWorkOrder({
          supabase: input.identity.supabase,
          shopId: input.identity.shopId,
          technicianIds: [input.identity.authUserId, input.identity.profileId],
          workOrderId: actionWorkOrderId,
        });
        if (boundAction.action.type === "job.complete") {
          completionNeedsDisposition = true;
        }
      }
    }
  }

  if (!existingAssistant) {
    await append(input.identity, {
      sessionId: session.id,
      eventType: "conversation.assistant",
      turnId: input.turnId,
      suffix: "assistant",
      origin: "copilot",
      details: { text: reply, turnId: input.turnId },
    });
  }

  if (completionNeedsDisposition) {
    const completionWorkOrderId =
      storedAction?.workOrderId ?? session.workOrderId;
    activeWorkOrder = await loadTechnicianWorkCandidateForWorkOrder({
      supabase: input.identity.supabase,
      shopId: input.identity.shopId,
      technicianIds: [input.identity.authUserId, input.identity.profileId],
      workOrderId: completionWorkOrderId,
    });
    const nextLine = selectNextTechnicianWorkLine(
      activeWorkOrder?.lines ?? [],
    );
    if (nextLine) {
      await command<{ sessionId: string }>(input.identity, "session.start", {
        workOrderId: completionWorkOrderId,
        workOrderLineId: nextLine.id,
        mode: session.mode,
        operationId: deriveCopilotOperationId(
          input.turnId,
          "completion-session-reanchor",
        ),
      });
      session.activeWorkOrderLineId = nextLine.id;
    } else {
      await command(input.identity, "session.close", {
        sessionId: session.id,
        operationId: deriveCopilotOperationId(
          input.turnId,
          "completion-session-close",
        ),
        reason: "completed_last_actionable_line",
      });
    }
  }

  const finalEnvelope = await read(input.identity, session.id);
  if (!finalEnvelope.session) {
    throw new TechnicianCopilotConflictError(
      "technician_copilot_session_stale",
      "The CoPilot completion result could not be restored.",
    );
  }
  const finalContext = projectTechnicianContext({
    repairSessionId: session.id,
    mode: finalEnvelope.session.mode,
    status: finalEnvelope.session.status,
    events: finalEnvelope.events,
  });
  const persistedAssistant = finalContext.conversation.find(
    (turn) => turn.turnId === input.turnId && turn.role === "assistant",
  );

  return {
    sessionId:
      finalEnvelope.session.status === "active"
        ? finalEnvelope.session.id
        : null,
    session:
      finalEnvelope.session.status === "active" ? finalEnvelope.session : null,
    reply: persistedAssistant?.text ?? reply,
    context: finalContext,
    workOrder: activeWorkOrder,
    capabilities,
    replayed: Boolean(existingAssistant || replayedActionResult),
  };
}
