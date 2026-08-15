export const TECHNICIAN_COPILOT_ACTION_TYPES = [
  "none",
  "work.next",
  "job.start",
  "job.hold",
  "job.release_hold",
  "job.story.save",
  "job.complete",
] as const;

export type TechnicianCopilotActionType =
  (typeof TECHNICIAN_COPILOT_ACTION_TYPES)[number];

export type TechnicianCopilotAction =
  | { type: "none" }
  | { type: "work.next" }
  | { type: "job.start"; workOrderLineId: string | null }
  | {
      type: "job.hold";
      workOrderLineId: string | null;
      reason: string | null;
    }
  | { type: "job.release_hold"; workOrderLineId: string | null }
  | {
      type: "job.story.save";
      workOrderLineId: string | null;
      cause: string | null;
      correction: string | null;
    }
  | {
      type: "job.complete";
      workOrderLineId: string | null;
      cause: string | null;
      correction: string | null;
    };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, maxLength);
  return normalized || null;
}

export function parseTechnicianCopilotAction(
  candidate: unknown,
): TechnicianCopilotAction {
  const value = record(candidate);
  const type = text(value?.type, 80);
  const workOrderLineId = text(value?.workOrderLineId, 128);

  switch (type) {
    case "work.next":
      return { type };
    case "job.start":
    case "job.release_hold":
      return { type, workOrderLineId };
    case "job.hold":
      return {
        type,
        workOrderLineId,
        reason: text(value?.reason, 500),
      };
    case "job.story.save":
    case "job.complete":
      return {
        type,
        workOrderLineId,
        cause: text(value?.cause, 4_000),
        correction: text(value?.correction, 4_000),
      };
    default:
      return { type: "none" };
  }
}
