import type { RepairSessionEvent } from "./types";

export const SILENT_DOCUMENTATION_EVENT_TYPES = [
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
] as const;

export type SilentDocumentationEventType =
  (typeof SILENT_DOCUMENTATION_EVENT_TYPES)[number];

export type SilentDocumentationEvent = {
  type: SilentDocumentationEventType;
  details: Record<string, unknown>;
};

const TYPE_SET = new Set<string>(SILENT_DOCUMENTATION_EVENT_TYPES);
const GLOBAL_FACT_TYPES = new Set<SilentDocumentationEventType>([
  "observation.recorded",
  "diagnostic.finding",
]);
const OCCURRENCE_EVENT_TYPES = new Set<SilentDocumentationEventType>([
  "measurement.recorded",
  "dtc.observed",
]);
const COMPONENT_EVENT_TYPES = new Set<SilentDocumentationEventType>([
  "component.removed",
  "component.installed",
  "component.disconnected",
  "component.connected",
]);
const FLUID_EVENT_TYPES = new Set<SilentDocumentationEventType>([
  "fluid.drained",
  "fluid.filled",
]);

const FINGERPRINT_FIELDS: Record<SilentDocumentationEventType, string[]> = {
  "task.changed": ["task"],
  "observation.recorded": [
    "text",
    "assessment",
    "system",
    "component",
    "location",
  ],
  "measurement.recorded": [
    "label",
    "value",
    "unit",
    "condition",
    "component",
    "location",
  ],
  "dtc.observed": ["code", "module", "status"],
  "diagnostic.finding": [
    "text",
    "disposition",
    "system",
    "component",
    "location",
  ],
  "component.removed": ["component", "location"],
  "component.installed": ["component", "location"],
  "component.disconnected": ["component", "location"],
  "component.connected": ["component", "location"],
  "fluid.drained": ["fluid", "system"],
  "fluid.filled": ["fluid", "system"],
};

function normalized(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function hash32(input: string, seed: number): number {
  let value = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619) >>> 0;
  }
  return value >>> 0;
}

export function createDocumentationFingerprint(
  type: SilentDocumentationEventType,
  details: Record<string, unknown>,
): string {
  const canonical = [
    type,
    ...FINGERPRINT_FIELDS[type].map((field) => normalized(details[field])),
  ].join("|");
  const left = hash32(canonical, 2166136261)
    .toString(16)
    .padStart(8, "0");
  const right = hash32(canonical, 2246822519)
    .toString(16)
    .padStart(8, "0");
  return `doc-v1-${left}${right}`;
}

function existingFingerprint(event: RepairSessionEvent): string | null {
  if (!TYPE_SET.has(event.eventType)) return null;
  const stored = event.payload?.documentationFingerprint;
  if (typeof stored === "string" && stored.trim()) return stored.trim();
  return createDocumentationFingerprint(
    event.eventType as SilentDocumentationEventType,
    event.payload ?? {},
  );
}

function componentEntityKey(details: Record<string, unknown>): string | null {
  const component = normalized(details.component);
  if (!component) return null;
  return `${normalized(details.location)}:${component}`;
}

function fluidEntityKey(details: Record<string, unknown>): string | null {
  const fluid = normalized(details.fluid);
  if (!fluid) return null;
  return `${normalized(details.system)}:${fluid}`;
}

function turnFingerprint(
  sourceTurnId: unknown,
  fingerprint: string,
): string | null {
  const turnId = normalized(sourceTurnId);
  return turnId ? `${turnId}:${fingerprint}` : null;
}

export function dedupeDocumentationEvents(
  existingEvents: readonly RepairSessionEvent[],
  candidates: readonly SilentDocumentationEvent[],
): SilentDocumentationEvent[] {
  const globalFactFingerprints = new Set<string>();
  const persistedTurnFingerprints = new Set<string>();
  const batchOccurrenceFingerprints = new Set<string>();
  const componentStates = new Map<string, SilentDocumentationEventType>();
  const fluidStates = new Map<string, SilentDocumentationEventType>();
  let latestTaskFingerprint: string | null = null;

  for (const event of existingEvents) {
    if (!TYPE_SET.has(event.eventType)) continue;
    const type = event.eventType as SilentDocumentationEventType;
    const fingerprint = existingFingerprint(event);
    if (!fingerprint) continue;

    if (GLOBAL_FACT_TYPES.has(type)) {
      globalFactFingerprints.add(fingerprint);
    }

    const existingTurnFingerprint = turnFingerprint(
      event.payload?.sourceTurnId,
      fingerprint,
    );
    if (existingTurnFingerprint) {
      persistedTurnFingerprints.add(existingTurnFingerprint);
    }

    if (type === "task.changed") {
      latestTaskFingerprint = fingerprint;
    } else if (COMPONENT_EVENT_TYPES.has(type)) {
      const key = componentEntityKey(event.payload ?? {});
      if (key) componentStates.set(key, type);
    } else if (FLUID_EVENT_TYPES.has(type)) {
      const key = fluidEntityKey(event.payload ?? {});
      if (key) fluidStates.set(key, type);
    }
  }

  const accepted: SilentDocumentationEvent[] = [];

  for (const candidate of candidates) {
    const fingerprint = createDocumentationFingerprint(
      candidate.type,
      candidate.details,
    );
    const candidateTurnFingerprint = turnFingerprint(
      candidate.details.sourceTurnId,
      fingerprint,
    );

    if (
      candidateTurnFingerprint &&
      persistedTurnFingerprints.has(candidateTurnFingerprint)
    ) {
      continue;
    }

    if (
      GLOBAL_FACT_TYPES.has(candidate.type) &&
      globalFactFingerprints.has(fingerprint)
    ) {
      continue;
    }

    if (
      OCCURRENCE_EVENT_TYPES.has(candidate.type) &&
      batchOccurrenceFingerprints.has(fingerprint)
    ) {
      continue;
    }

    if (
      candidate.type === "task.changed" &&
      latestTaskFingerprint === fingerprint
    ) {
      continue;
    }

    const componentKey = COMPONENT_EVENT_TYPES.has(candidate.type)
      ? componentEntityKey(candidate.details)
      : null;
    if (
      componentKey &&
      componentStates.get(componentKey) === candidate.type
    ) {
      continue;
    }

    const fluidKey = FLUID_EVENT_TYPES.has(candidate.type)
      ? fluidEntityKey(candidate.details)
      : null;
    if (fluidKey && fluidStates.get(fluidKey) === candidate.type) {
      continue;
    }

    if (GLOBAL_FACT_TYPES.has(candidate.type)) {
      globalFactFingerprints.add(fingerprint);
    }
    if (OCCURRENCE_EVENT_TYPES.has(candidate.type)) {
      batchOccurrenceFingerprints.add(fingerprint);
    }
    if (candidate.type === "task.changed") {
      latestTaskFingerprint = fingerprint;
    }
    if (componentKey) componentStates.set(componentKey, candidate.type);
    if (fluidKey) fluidStates.set(fluidKey, candidate.type);

    accepted.push({
      type: candidate.type,
      details: {
        ...candidate.details,
        documentationFingerprint: fingerprint,
      },
    });
  }

  return accepted;
}
