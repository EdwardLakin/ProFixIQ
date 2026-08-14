import "server-only";

import { runOpenAIStructuredJson } from "@/features/shared/lib/server/openai-structured";
import type {
  SilentDocumentationEvent,
  SilentDocumentationEventType,
} from "../session/documentationFingerprint";

const EVENT_TYPES = new Set<SilentDocumentationEventType>([
  "task.changed",
  "observation.recorded",
  "measurement.recorded",
  "dtc.observed",
  "diagnostic.finding",
  "component.removed",
  "component.installed",
  "component.disconnected",
  "component.connected",
  "fluid.drained",
  "fluid.filled",
]);

const ASSESSMENTS = new Set(["abnormal", "normal", "unknown"]);
const DISPOSITIONS = new Set([
  "suspected",
  "confirmed",
  "ruled_out",
  "normal",
]);

export type DocumentationExtraction = {
  events: SilentDocumentationEvent[];
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return cleaned || null;
}

function optionalText(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  field: string,
  maxLength = 160,
) {
  const value = text(source[field], maxLength);
  if (value) target[field] = value;
}

function confidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.75;
  return Math.max(0, Math.min(1, value));
}

function normalizeDetails(
  type: SilentDocumentationEventType,
  source: Record<string, unknown>,
): Record<string, unknown> | null {
  if (type === "task.changed") {
    const task = text(source.task, 240);
    return task ? { task } : null;
  }

  if (type === "observation.recorded") {
    const observation = text(source.text, 700);
    if (!observation) return null;
    const details: Record<string, unknown> = { text: observation };
    const assessment = text(source.assessment, 24)?.toLowerCase();
    if (assessment && ASSESSMENTS.has(assessment)) {
      details.assessment = assessment;
    }
    optionalText(details, source, "system");
    optionalText(details, source, "component");
    optionalText(details, source, "location");
    return details;
  }

  if (type === "measurement.recorded") {
    const label = text(source.label, 240);
    const value = text(source.value, 120);
    if (!label || !value) return null;
    const details: Record<string, unknown> = { label, value };
    optionalText(details, source, "unit", 40);
    optionalText(details, source, "condition", 240);
    optionalText(details, source, "component");
    optionalText(details, source, "location");
    return details;
  }

  if (type === "dtc.observed") {
    const code = text(source.code, 32)?.toUpperCase();
    if (!code) return null;
    const details: Record<string, unknown> = { code };
    optionalText(details, source, "module", 80);
    optionalText(details, source, "status", 80);
    optionalText(details, source, "description", 320);
    return details;
  }

  if (type === "diagnostic.finding") {
    const finding = text(source.text, 700);
    const disposition = text(source.disposition, 32)?.toLowerCase();
    if (!finding || !disposition || !DISPOSITIONS.has(disposition)) {
      return null;
    }
    const details: Record<string, unknown> = {
      text: finding,
      disposition,
    };
    optionalText(details, source, "system");
    optionalText(details, source, "component");
    optionalText(details, source, "location");
    return details;
  }

  if (
    type === "component.removed" ||
    type === "component.installed" ||
    type === "component.disconnected" ||
    type === "component.connected"
  ) {
    const component = text(source.component, 240);
    if (!component) return null;
    const details: Record<string, unknown> = { component };
    optionalText(details, source, "location");
    return details;
  }

  if (type === "fluid.drained" || type === "fluid.filled") {
    const fluid = text(source.fluid, 160);
    if (!fluid) return null;
    const details: Record<string, unknown> = { fluid };
    optionalText(details, source, "system");
    return details;
  }

  return null;
}

export function validateTechnicianDocumentationExtraction(
  candidate: unknown,
): DocumentationExtraction {
  const value = object(candidate);
  const events: SilentDocumentationEvent[] = [];
  if (!Array.isArray(value?.events)) return { events };

  for (const raw of value.events.slice(0, 12)) {
    const event = object(raw);
    const rawType = text(event?.type, 80);
    if (!rawType || !EVENT_TYPES.has(rawType as SilentDocumentationEventType)) {
      continue;
    }

    const eventConfidence = confidence(event?.confidence);
    if (eventConfidence < 0.6) continue;
    const details = normalizeDetails(
      rawType as SilentDocumentationEventType,
      object(event?.details) ?? {},
    );
    if (!details) continue;

    events.push({
      type: rawType as SilentDocumentationEventType,
      details: { ...details, confidence: eventConfidence },
    });
  }

  return { events };
}

const SYSTEM = `You are the silent documentation engine for the ProFixIQ Technician CoPilot.
Your job is to convert only NEW facts explicitly stated in the technician's current message into structured repair-session events.
The current message is the factual source. Repair context is supplied only to resolve references such as a component, location, or active task. Never re-extract old context as new documentation.
Do not document questions, hypothetical ideas, future plans, CoPilot suggestions, customer claims not repeated as technician findings, or actions the technician did not say were completed.
Do not infer a diagnosis from evidence. Use diagnostic.finding only when the technician explicitly states a conclusion, confirms a cause, rules something out, or says a component/system is normal.
Use observation.recorded for direct visual, tactile, audible, or functional facts. Use task.changed when the technician states what they are checking or working on.
Measurements require an explicit value. DTCs require an explicit code. Component and fluid state events require an explicit physical action.
Prefer one strongest event for a statement rather than duplicating the same fact as both an observation and a finding.
Do not write canonical work-order notes, labor, parts, approvals, billing, customer messages, or status changes.
Return JSON only: {events:[{type,confidence,details}]}.
Allowed event types and required details:
- task.changed: {task}
- observation.recorded: {text,assessment?,system?,component?,location?}; assessment is abnormal, normal, or unknown
- measurement.recorded: {label,value,unit?,condition?,component?,location?}
- dtc.observed: {code,module?,status?,description?}
- diagnostic.finding: {text,disposition,system?,component?,location?}; disposition is suspected, confirmed, ruled_out, or normal
- component.removed / installed / disconnected / connected: {component,location?}
- fluid.drained / filled: {fluid,system?}`;

export async function extractTechnicianDocumentationTurn(input: unknown) {
  const result = await runOpenAIStructuredJson<DocumentationExtraction>({
    purpose: "extraction",
    feature: "technician_copilot_documentation",
    system: SYSTEM,
    user: input,
    schemaName: "technician_copilot_documentation_turn",
    validate: validateTechnicianDocumentationExtraction,
    fallback: () => ({ events: [] }),
    requireAI: true,
    maxOutputTokens: 1000,
    temperature: 0,
  });
  return result.output;
}
