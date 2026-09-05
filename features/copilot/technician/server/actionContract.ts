export const TECHNICIAN_COPILOT_ACTION_TYPES = [
  "none",
  "work.next",
  "job.start",
  "job.hold",
  "job.release_hold",
  "job.story.save",
  "job.complete",
  "job.parts.request",
  "message.reply",
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
    }
  | {
      type: "job.parts.request";
      workOrderLineId: string | null;
      items: { description: string; qty: number }[];
      notes: string | null;
    }
  | {
      type: "message.reply";
      conversationId: string | null;
      content: string | null;
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

const MAX_PARTS_REQUEST_ITEMS = 20;

function partsRequestItems(
  value: unknown,
): { description: string; qty: number }[] {
  if (!Array.isArray(value)) return [];
  const items: { description: string; qty: number }[] = [];
  for (const candidate of value) {
    if (items.length >= MAX_PARTS_REQUEST_ITEMS) break;
    const entry = record(candidate);
    const description = text(entry?.description, 200);
    const qty = Number(entry?.qty);
    if (!description || !Number.isFinite(qty) || qty < 1 || qty > 10_000) {
      continue;
    }
    items.push({ description, qty: Math.floor(qty) });
  }
  return items;
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
    case "job.parts.request":
      return {
        type,
        workOrderLineId,
        items: partsRequestItems(value?.items),
        notes: text(value?.notes, 1_000),
      };
    case "message.reply":
      return {
        type,
        conversationId: text(value?.conversationId, 128),
        content: text(value?.content, 4_000),
      };
    default:
      return { type: "none" };
  }
}
