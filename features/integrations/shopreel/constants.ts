import type { ProFixIQStoryEventType } from "./types";

export const SHOPREEL_EVENT_TYPES = [
  "inspection.completed",
  "inspection.finding.flagged",
  "inspection.media.captured",
  "workorder.approved",
  "workorder.completed",
  "media.before_after.added",
  "operations.signal",
] as const satisfies readonly ProFixIQStoryEventType[];

export const SHOPREEL_EVENT_TYPE_SET = new Set<string>(SHOPREEL_EVENT_TYPES);

export function getDefaultShopReelEventTypes(): ProFixIQStoryEventType[] {
  return [...SHOPREEL_EVENT_TYPES];
}

export function sanitizeShopReelEventTypes(values: unknown): ProFixIQStoryEventType[] {
  if (!Array.isArray(values)) {
    return getDefaultShopReelEventTypes();
  }

  const deduped = new Set<ProFixIQStoryEventType>();

  for (const value of values) {
    if (typeof value !== "string") continue;
    if (!SHOPREEL_EVENT_TYPE_SET.has(value)) continue;
    deduped.add(value as ProFixIQStoryEventType);
  }

  if (deduped.size === 0) {
    return getDefaultShopReelEventTypes();
  }

  return [...deduped];
}
