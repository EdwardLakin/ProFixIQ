export const DEFAULT_SHOPREEL_BASE_URL = "https://shopreel.profixiq.com";

export const DEFAULT_SHOPREEL_EVENT_TYPES = [
  "inspection.completed",
  "inspection.finding.flagged",
  "inspection.media.captured",
  "workorder.approved",
  "workorder.completed",
  "media.before_after.added",
  "operations.signal",
] as const;

export function getShopReelBaseUrl() {
  return process.env.SHOPREEL_BASE_URL ?? DEFAULT_SHOPREEL_BASE_URL;
}
