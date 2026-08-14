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
  listTechnicianWorkCandidates,
  type TechnicianWorkCandidate,
} from "./assignedWork";
import { extractTechnicianDocumentationTurn } from "./documentation";
import { decideTechnicianCopilotTurn } from "./model";
import { deriveCopilotOperationId } from "./operationId";
import { sendCopilotServerCommand } from "./transport";

export type CopilotIdentity = {
  authUserId: string;
  profileId: string;
  shopId: string;
  documentationEnabled: boolean;
  supabase: Parameters<typeof listTechnicianWorkCandidates>[0];
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

type CopilotCommand =
  | "session.read"
  | "session.start"
  | "event.append"
  | "documentation.append";

function command<T>(
  identity: CopilotIdentity,
  action: CopilotCommand,
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
    ? candidates.find((candidate) => candidate.id === id) ?? null
    : null;
}

function complaintFor(candidate: TechnicianWorkCandidate | null): string | null {
  if (!candidate) return null;
  const values = [candidate.concern, ...candidate.lineComplaints]
    .map((value) => value?.trim())
    .filter(Boolean) as string[];
  return values.length ? [...new Set(values)].join(" | ") : null;
}

async function append(
  identity: CopilotIdentity,
  input: {
    sessionId: string;
    eventType: string;
    turnId: string;
    suffix: string;
    origin: "ui" | "copilot" | "system";
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
    operationId: deriveCopilotOperationId(
      input.turnId,
      "documentation-turn",
    ),
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
}) {
  const capabilities = {
    documentation: input.identity.documentationEnabled,
  };
  const candidates = await listTechnicianWorkCandidates(
    input.identity.supabase,
  );
  let envelope = await read(input.identity, input.sessionId);
  let context = envelope.session
    ? projectTechnicianContext({
        repairSessionId: envelope.session.id,
        mode: envelope.session.mode,
        status: envelope.session.status,
        events: envelope.events,
      })
    : null;

  const existingAssistant = context?.conversation.find(
    (turn) => turn.turnId === input.turnId && turn.role === "assistant",
  );
  const documentationAlreadyFinalized =
    envelope.documentationTurns?.includes(input.turnId) ?? false;
  if (
    existingAssistant &&
    envelope.session &&
    (!input.identity.documentationEnabled || documentationAlreadyFinalized)
  ) {
    return {
      sessionId: envelope.session.id,
      reply: existingAssistant.text,
      context,
      workOrder: candidateFor(candidates, envelope.session.workOrderId),
      capabilities,
      replayed: true,
    };
  }

  if (!envelope.session) {
    const decision = await decideTechnicianCopilotTurn({
      message: input.message,
      activeSession: null,
      assignedWork: candidates,
    });
    const selected =
      decision.mode === "start"
        ? candidateFor(candidates, decision.workOrderId)
        : null;
    if (!selected) {
      return {
        sessionId: null,
        reply: decision.reply,
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
        operationId: deriveCopilotOperationId(
          input.turnId,
          "session-start",
        ),
      },
    );
    envelope = await read(input.identity, started.sessionId);
  }

  const session = envelope.session;
  if (!session) {
    throw new Error("Technician CoPilot could not establish a repair session.");
  }

  const userAlreadyStored = envelope.events.some(
    (event) =>
      event.eventType === "conversation.user" &&
      event.payload?.turnId === input.turnId,
  );
  if (!userAlreadyStored) {
    await append(input.identity, {
      sessionId: session.id,
      eventType: "conversation.user",
      turnId: input.turnId,
      suffix: "user",
      origin: "ui",
      details: { text: input.message, turnId: input.turnId },
    });
  }

  const activeWorkOrder = candidateFor(candidates, session.workOrderId);
  const existingComplaint = complaintFor(activeWorkOrder);
  if (
    existingComplaint &&
    !envelope.events.some(
      (event) => event.eventType === "complaint.recorded",
    )
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
  context = projectTechnicianContext({
    repairSessionId: session.id,
    mode: session.mode,
    status: session.status,
    events: envelope.events,
  });

  const replyPromise = existingAssistant
    ? Promise.resolve(existingAssistant.text)
    : decideTechnicianCopilotTurn({
        message: input.message,
        activeSession: {
          id: session.id,
          workOrderId: session.workOrderId,
        },
        workOrder: activeWorkOrder,
        repairContext: context,
      }).then((decision) => decision.reply);
  const [reply, documentationExtraction] = await Promise.all([
    replyPromise,
    extractDocumentation({
      enabled: input.identity.documentationEnabled,
      message: input.message,
      turnId: input.turnId,
      context,
      workOrder: activeWorkOrder,
    }),
  ]);

  const documentationEvents = dedupeDocumentationEvents(
    envelope.events,
    documentationExtraction.events,
  );
  if (documentationExtraction.completed) {
    try {
      await appendDocumentationTurn(input.identity, {
        sessionId: session.id,
        turnId: input.turnId,
        events: documentationEvents,
      });
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

  await append(input.identity, {
    sessionId: session.id,
    eventType: "conversation.assistant",
    turnId: input.turnId,
    suffix: "assistant",
    origin: "copilot",
    details: { text: reply, turnId: input.turnId },
  });

  const finalEnvelope = await read(input.identity, session.id);
  const finalContext = projectTechnicianContext({
    repairSessionId: session.id,
    mode: session.mode,
    status: session.status,
    events: finalEnvelope.events,
  });
  const persistedAssistant = finalContext.conversation.find(
    (turn) => turn.turnId === input.turnId && turn.role === "assistant",
  );

  return {
    sessionId: session.id,
    reply: persistedAssistant?.text ?? reply,
    context: finalContext,
    workOrder: activeWorkOrder,
    capabilities,
    replayed: Boolean(existingAssistant),
  };
}
