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

export function dedupeDocumentationEvents(
  existingEvents: readonly RepairSessionEvent[],
  candidates: readonly SilentDocumentationEvent[],
): SilentDocumentationEvent[] {
  const fingerprints = new Set(
    existingEvents
      .map(existingFingerprint)
      .filter((value): value is string => Boolean(value)),
  );
  const accepted: SilentDocumentationEvent[] = [];

  for (const candidate of candidates) {
    const fingerprint = createDocumentationFingerprint(
      candidate.type,
      candidate.details,
    );
    if (fingerprints.has(fingerprint)) continue;
    fingerprints.add(fingerprint);
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
