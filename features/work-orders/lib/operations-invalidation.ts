export const OPERATIONS_INVALIDATION_EVENT = "profixiq:operations-invalidated";

export const OPERATIONS_REALTIME_TABLES = [
  "work_orders",
  "work_order_lines",
  "part_requests",
  "part_request_items",
  "work_order_quote_lines",
] as const;

export type OperationsLiveStatus = "connecting" | "live" | "unavailable";

type RealtimeRecord = Record<string, unknown>;

type RealtimeMutationPayload = {
  eventType?: string;
  new?: RealtimeRecord;
  old?: RealtimeRecord;
};

function cleanKeyPart(value: unknown): string {
  return String(value ?? "").trim();
}

export function operationsRealtimeMutationKey(
  table: string,
  payload: RealtimeMutationPayload,
): string {
  const nextRecord = payload.new ?? {};
  const previousRecord = payload.old ?? {};
  const record = cleanKeyPart(nextRecord.id) ? nextRecord : previousRecord;
  const id = cleanKeyPart(record.id) || "unknown";
  const version =
    cleanKeyPart(record.updated_at) ||
    cleanKeyPart(record.status) ||
    cleanKeyPart(record.created_at) ||
    "unversioned";
  return `${table}:${cleanKeyPart(payload.eventType) || "change"}:${id}:${version}`;
}

export function createOperationsEventDeduper(maxEntries = 250): {
  accept: (key: string) => boolean;
} {
  const seen = new Set<string>();
  const order: string[] = [];

  return {
    accept(key: string) {
      if (seen.has(key)) return false;
      seen.add(key);
      order.push(key);
      while (order.length > maxEntries) {
        const oldest = order.shift();
        if (oldest) seen.delete(oldest);
      }
      return true;
    },
  };
}

export function emitOperationsInvalidation(detail: {
  entity: string;
  recordId: string;
  mutationId?: string;
}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(OPERATIONS_INVALIDATION_EVENT, { detail }),
  );
}
