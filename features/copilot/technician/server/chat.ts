import "server-only";

import type { RepairSessionEvent, RepairSessionMode, RepairSessionStatus } from "../session/types";
import { projectTechnicianContext } from "../session/projectTechnicianContext";
import { listTechnicianWorkCandidates, type TechnicianWorkCandidate } from "./assignedWork";
import { decideTechnicianCopilotTurn } from "./model";
import { deriveCopilotOperationId } from "./operationId";
import { sendCopilotServerCommand } from "./transport";

export type CopilotIdentity = {
  authUserId: string;
  profileId: string;
  shopId: string;
  supabase: Parameters<typeof listTechnicianWorkCandidates>[0];
};

type Session = {
  id: string;
  workOrderId: string;
  activeWorkOrderLineId: string | null;
  mode: RepairSessionMode;
  status: RepairSessionStatus;
};

type Envelope = { session: Session | null; events: RepairSessionEvent[] };

function command<T>(identity: CopilotIdentity, action: "session.read" | "session.start" | "event.append", args: Record<string, unknown>) {
  return sendCopilotServerCommand<T>({
    authUserId: identity.authUserId,
    profileId: identity.profileId,
    shopId: identity.shopId,
    action,
    args,
  });
}

function read(identity: CopilotIdentity, sessionId?: string | null) {
  return command<Envelope>(identity, "session.read", { sessionId: sessionId ?? null });
}

function candidateFor(candidates: TechnicianWorkCandidate[], id: string | null | undefined) {
  return id ? candidates.find((candidate) => candidate.id === id) ?? null : null;
}

function complaintFor(candidate: TechnicianWorkCandidate | null): string | null {
  if (!candidate) return null;
  const values = [candidate.concern, ...candidate.lineComplaints].map((value) => value?.trim()).filter(Boolean) as string[];
  return values.length ? [...new Set(values)].join(" | ") : null;
}

async function append(identity: CopilotIdentity, input: {
  sessionId: string;
  eventType: string;
  turnId: string;
  suffix: string;
  origin: "ui" | "copilot" | "system";
  details: Record<string, unknown>;
}) {
  return command(identity, "event.append", {
    sessionId: input.sessionId,
    eventType: input.eventType,
    origin: input.origin,
    operationId: deriveCopilotOperationId(input.turnId, input.suffix),
    details: input.details,
    occurredAt: new Date().toISOString(),
  });
}

export async function runTechnicianCopilotTurn(input: {
  identity: CopilotIdentity;
  message: string;
  turnId: string;
  sessionId?: string | null;
}) {
  const candidates = await listTechnicianWorkCandidates(input.identity.supabase);
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
  if (existingAssistant && envelope.session) {
    return {
      sessionId: envelope.session.id,
      reply: existingAssistant.text,
      context,
      workOrder: candidateFor(candidates, envelope.session.workOrderId),
      replayed: true,
    };
  }

  if (!envelope.session) {
    const decision = await decideTechnicianCopilotTurn({
      message: input.message,
      activeSession: null,
      assignedWork: candidates,
    });
    const selected = decision.mode === "start" ? candidateFor(candidates, decision.workOrderId) : null;
    if (!selected) {
      return { sessionId: null, reply: decision.reply, context: null, workOrder: null, replayed: false };
    }

    const lineId = decision.workOrderLineId && selected.lineIds.includes(decision.workOrderLineId)
      ? decision.workOrderLineId
      : selected.lineIds.length === 1 ? selected.lineIds[0] : null;
    const started = await command<{ sessionId: string }>(input.identity, "session.start", {
      workOrderId: selected.id,
      workOrderLineId: lineId,
      mode: "shop",
      operationId: deriveCopilotOperationId(input.turnId, "session-start"),
    });
    envelope = await read(input.identity, started.sessionId);
  }

  const session = envelope.session;
  if (!session) throw new Error("Technician CoPilot could not establish a repair session.");

  const userAlreadyStored = envelope.events.some(
    (event) => event.eventType === "conversation.user" && event.payload?.turnId === input.turnId,
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
  if (existingComplaint && !envelope.events.some((event) => event.eventType === "complaint.recorded")) {
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

  const decision = await decideTechnicianCopilotTurn({
    message: input.message,
    activeSession: { id: session.id, workOrderId: session.workOrderId },
    workOrder: activeWorkOrder,
    repairContext: context,
  });

  for (let index = 0; index < decision.events.length; index += 1) {
    const event = decision.events[index];
    await append(input.identity, {
      sessionId: session.id,
      eventType: event.type,
      turnId: input.turnId,
      suffix: `memory-${index}-${event.type}`,
      origin: "copilot",
      details: event.details,
    });
  }

  await append(input.identity, {
    sessionId: session.id,
    eventType: "conversation.assistant",
    turnId: input.turnId,
    suffix: "assistant",
    origin: "copilot",
    details: { text: decision.reply, turnId: input.turnId },
  });

  const finalEnvelope = await read(input.identity, session.id);
  const finalContext = projectTechnicianContext({
    repairSessionId: session.id,
    mode: session.mode,
    status: session.status,
    events: finalEnvelope.events,
  });

  return {
    sessionId: session.id,
    reply: decision.reply,
    context: finalContext,
    workOrder: activeWorkOrder,
    replayed: false,
  };
}
