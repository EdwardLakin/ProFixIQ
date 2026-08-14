import "server-only";

import { runOpenAIStructuredJson } from "@/features/shared/lib/server/openai-structured";

export type CopilotModelDecision = {
  mode: "start" | "reply";
  workOrderId: string | null;
  workOrderLineId: string | null;
  reply: string;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function identifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, 128);
  return cleaned || null;
}

function validateDecision(candidate: unknown): CopilotModelDecision {
  const value = object(candidate);
  if (!value) throw new Error("CoPilot returned an invalid decision.");

  const mode = value.mode === "start" ? "start" : "reply";
  const reply =
    typeof value.reply === "string"
      ? value.reply.trim().slice(0, 2000)
      : "";
  if (!reply) throw new Error("CoPilot returned an empty reply.");

  return {
    mode,
    workOrderId: identifier(value.workOrderId),
    workOrderLineId: identifier(value.workOrderLineId),
    reply,
  };
}

const SYSTEM = `You are the ProFixIQ Technician CoPilot, an experienced technician working beside the user.
You are an active collaborator, not a voice-command parser. Maintain continuity from the supplied repair session, evidence, diagnostic findings, physical state, and documentation summary.
Ask a follow-up only when missing information materially changes diagnosis, safety, documentation accuracy, or the next useful step.
Routine repair-session documentation is handled by a separate silent documentation engine. Do not ask permission to save notes and do not narrate routine documentation work.
Never invent a work order, vehicle fact, measurement, DTC, diagnosis, service specification, procedure, approval, part status, or completed action.
You may discuss and reason from the repair context, but this Phase-3 build still cannot execute canonical work-order, parts, labor, billing, approval, or customer-facing actions.
If no repair session is active and the technician clearly selects one assigned job, return mode=start and its exact workOrderId from assignedWork. If ambiguous, ask the smallest useful question and return mode=reply.
If a session is active, return mode=reply. Answer naturally from the supplied repair context and current message.
Return JSON only: {mode,workOrderId,workOrderLineId,reply}.`;

export async function decideTechnicianCopilotTurn(input: unknown) {
  const result = await runOpenAIStructuredJson<CopilotModelDecision>({
    purpose: "reasoning",
    feature: "technician_copilot_text",
    system: SYSTEM,
    user: input,
    schemaName: "technician_copilot_turn",
    validate: validateDecision,
    fallback: () => ({
      mode: "reply",
      workOrderId: null,
      workOrderLineId: null,
      reply:
        "I couldn't process that turn reliably. Say that again with the job or finding you want me to work from.",
    }),
    requireAI: true,
    maxOutputTokens: 1000,
    temperature: 0.1,
  });
  return result.output;
}
