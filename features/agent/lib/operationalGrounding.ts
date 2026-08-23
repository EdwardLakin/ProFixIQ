import type {
  AssistantAnswer,
  AssistantGrounding,
} from "@/features/agent/assistant/types";
import type { ShopAssistantActor } from "@/features/shop-assistant/server/requireShopAssistantActor";
import { AI_QUERY_SCHEMA_VERSION } from "./aiQueryContract";

const COLLECTION_KEYS = [
  "items",
  "records",
  "workOrders",
  "requests",
  "units",
  "bookings",
  "customers",
  "vehicles",
  "parts",
  "invoices",
  "technicians",
  "changes",
  "alerts",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function inferOperationalRecordCount(value: unknown): number {
  const record = asRecord(value);
  if (!record) return 0;

  const explicit = Number(record.recordCount);
  if (Number.isInteger(explicit) && explicit >= 0) return explicit;

  for (const key of COLLECTION_KEYS) {
    const collection = record[key];
    if (Array.isArray(collection)) return collection.length;
  }
  return 0;
}

export function createOperationalGrounding(params: {
  shopId: string;
  role: string;
  recordCount: number;
  dataCurrentAsOf?: string;
  freshnessWindowMs?: number;
}): AssistantGrounding {
  return {
    tenantId: params.shopId,
    shopId: params.shopId,
    role: params.role,
    recordCount: Math.max(0, Math.trunc(params.recordCount)),
    dataCurrentAsOf: params.dataCurrentAsOf ?? new Date().toISOString(),
    freshnessWindowMs: params.freshnessWindowMs ?? 60_000,
    schemaVersion: AI_QUERY_SCHEMA_VERSION,
  };
}

export function groundShopAssistantToolOutput(
  output: unknown,
  actor: ShopAssistantActor,
): unknown {
  const record = asRecord(output);
  if (!record) return output;
  return {
    ...record,
    grounding: createOperationalGrounding({
      shopId: actor.shopId,
      role: actor.canonicalRole,
      recordCount: inferOperationalRecordCount(record),
    }),
  };
}

export function groundAssistantAnswer(params: {
  answer: AssistantAnswer;
  shopId: string;
  role: string;
  requestedAt: string;
}): AssistantAnswer {
  const linkedRecords = new Set(
    [
      ...params.answer.entities.map(
        (entity) => entity.id ?? entity.href ?? entity.label,
      ),
      ...params.answer.links.map((link) => link.href),
    ].filter(Boolean),
  );
  const summaryCount = params.answer.summary.match(
    /(?:^|\b(?:there (?:are|is)|found|showing|returned)\s+)(\d+)\b/i,
  );
  const parsedSummaryCount = summaryCount ? Number(summaryCount[1]) : null;
  const recordCount =
    parsedSummaryCount != null && Number.isInteger(parsedSummaryCount)
      ? parsedSummaryCount
      : linkedRecords.size;

  return {
    ...params.answer,
    grounding: createOperationalGrounding({
      shopId: params.shopId,
      role: params.role,
      recordCount,
      dataCurrentAsOf: params.requestedAt,
    }),
  };
}
