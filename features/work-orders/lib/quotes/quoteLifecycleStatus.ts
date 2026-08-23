const HIDDEN_QUOTE_LIFECYCLE_STATUSES = new Set([
  "cancelled",
  "canceled",
  "rejected",
  "superseded",
  "voided",
]);

export function isHiddenQuoteLifecycleStatus(value: unknown): boolean {
  return (
    typeof value === "string" &&
    HIDDEN_QUOTE_LIFECYCLE_STATUSES.has(value.trim().toLowerCase())
  );
}
