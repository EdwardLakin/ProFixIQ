import "server-only";

import { runOpenAIStructuredJson } from "@/features/shared/lib/server/openai-structured";

const SAFE_EVENTS = new Set([
  "task.changed",
  "complaint.recorded",
  "observation.recorded",
  "measurement.recorded",
  "dtc.observed",
  "evidence.attached",
  "component.removed",
  "component.installed",
  "component.disconnected",
  "component.connected",
  "fluid.drained",
  "fluid.filled",
  "action.pending",
  "action.completed",
]);

export type CopilotModelEvent = { type: string; details: Record<string, unknown> };
export type CopilotModelDecision = {
  mode: "start" | "reply";
  workOrderId: string | null;
  workOrderLineId: string | null;
  reply: string;
  events: CopilotModelEvent[];
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validateDecision(candidate: unknown): CopilotModelDecision {
  const value = object(candidate);
  if (!value) throw new Error("CoPilot returned an invalid decision.");

  const mode = value.mode === "start" ? "start" : "reply";
  const reply = typeof value.reply === "string" ? value.reply.trim().slice(0, 2000) : "";
  if (!reply) throw new Error("CoPilot returned an empty reply.");

  const events: CopilotModelEvent[] = [];
  if (Array.isArray(value.events)) {
    for (const raw of value.events.slice(0, 12)) {
      const event = object(raw);
      const type = typeof event?.type === "string" ? event.type : "";
      const details = object(event?.details);
      if (SAFE_EVENTS.has(type) && details) events.push({ type, details });
    }
  }

  return {
    mode,
    workOrderId: typeof value.workOrderId === "string" ? value.workOrderId : null,
    workOrderLineId: typeof value.workOrderLineId === "string" ? value.workOrderLineId : null,
    reply,
    events,
  };
}

const SYSTEM = `You are the ProFixIQ Technician CoPilot, an experienced technician working beside the user.
You are an active collaborator, not a voice-command parser. Maintain continuity from the supplied repair session and evidence.
Ask a follow-up only when the missing information materially changes diagnosis, documentation, or what should happen next.
Routine repair-session documentation should happen silently through structured events; do not ask permission to save notes.
Never invent a work order, vehicle fact, measurement, DTC, diagnosis, service specification, procedure, approval, part status, or completed action.
In this Phase-2 build you may update repair-session memory only. You cannot execute canonical work-order, parts, labor, billing, approval, or customer-facing actions.
If no repair session is active and the technician clearly selects one assigned job, return mode=start and its exact workOrderId from assignedWork. If ambiguous, ask the smallest useful question and return mode=reply.
If a session is active, return mode=reply and extract only evidence actually stated by the technician.
Use task.changed when the technician says what they are checking or working on. Use observation.recorded for factual findings. Measurements and DTCs require explicit stated values/codes. Teardown events require explicit physical actions.
Return JSON only: {mode,workOrderId,workOrderLineId,reply,events:[{type,details}]}.`;

export async function decideTechnicianCopilotTurn(input: unknown) {
  const result = await runOpenAIStructuredJson<CopilotModelDecision>({
    purpose: "reasoning",
    feature: "technician_copilot_text",
    system: SYSTEM,
    user: input,
    schemaName: "technician_copilot_turn",
    validate: (candidate) => validateDecision(candidate),
    fallback: () => ({
      mode: "reply",
      workOrderId: null,
      workOrderLineId: null,
      reply: "I couldn't process that turn reliably. Say that again with the job or finding you want me to work from.",
      events: [],
    }),
    requireAI: true,
    maxOutputTokens: 1000,
    temperature: 0.1,
  });
  return result.output;
}
