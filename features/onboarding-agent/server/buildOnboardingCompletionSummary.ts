import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/features/shared/types/types/supabase";

type AdminSupabase = SupabaseClient<Database>;

type CountResult = {
  count: number | null;
  error: { message: string } | null;
};

type CompletionSummary = {
  completedAt: string;
  completedBy: string;
  liveRecords: {
    customersActivated: number;
    vehiclesActivated: number;
    suppliersActivated: number;
    partsActivated: number;
    historicalWorkOrdersActivated: number;
    historicalWorkOrderLinesActivated: number;
  };
  review: {
    openReviewItems: number;
    blockingReviewItems: number;
  };
  assistantHandoff: {
    available: true;
    source: "onboarding_sessions.summary";
    summaryText: string;
  };
};

type JsonObject = Record<string, unknown>;

function countOrThrow(result: CountResult, label: string): number {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return Number(result.count ?? 0);
}

async function countActivatedEntities(params: {
  supabase: AdminSupabase;
  shopId: string;
  sessionId: string;
  entityType: "customer" | "vehicle" | "vendor" | "part";
}): Promise<number> {
  const result = await params.supabase
    .from("onboarding_entities")
    .select("id", { head: true, count: "exact" })
    .eq("shop_id", params.shopId)
    .eq("session_id", params.sessionId)
    .eq("entity_type", params.entityType)
    .eq("status", "activated");

  return countOrThrow(result, `onboarding_entities:${params.entityType}`);
}

async function countHistoricalWorkOrders(params: {
  supabase: AdminSupabase;
  shopId: string;
  sessionId: string;
}): Promise<number> {
  const result = await params.supabase
    .from("work_orders")
    .select("id", { head: true, count: "exact" })
    .eq("shop_id", params.shopId)
    .eq("source_intake_id", params.sessionId);

  return countOrThrow(result, "work_orders");
}

async function countHistoricalWorkOrderLines(params: {
  supabase: AdminSupabase;
  shopId: string;
  sessionId: string;
}): Promise<number> {
  const result = await params.supabase
    .from("work_order_lines")
    .select("id", { head: true, count: "exact" })
    .eq("shop_id", params.shopId)
    .eq("source_intake_id", params.sessionId);

  return countOrThrow(result, "work_order_lines");
}

async function countReviewItems(params: {
  supabase: AdminSupabase;
  shopId: string;
  sessionId: string;
  severity?: "blocking";
}): Promise<number> {
  let query = params.supabase
    .from("onboarding_review_items")
    .select("id", { head: true, count: "exact" })
    .eq("shop_id", params.shopId)
    .eq("session_id", params.sessionId)
    .eq("status", "pending");

  if (params.severity) {
    query = query.eq("severity", params.severity);
  }

  const result = await query;
  return countOrThrow(result, params.severity ? "blocking review items" : "open review items");
}

export async function buildOnboardingCompletionSummary(params: {
  supabase: AdminSupabase;
  shopId: string;
  sessionId: string;
  actorId: string;
}): Promise<CompletionSummary> {
  const completedAt = new Date().toISOString();

  const [
    customersActivated,
    vehiclesActivated,
    suppliersActivated,
    partsActivated,
    historicalWorkOrdersActivated,
    historicalWorkOrderLinesActivated,
    openReviewItems,
    blockingReviewItems,
  ] = await Promise.all([
    countActivatedEntities({ ...params, entityType: "customer" }),
    countActivatedEntities({ ...params, entityType: "vehicle" }),
    countActivatedEntities({ ...params, entityType: "vendor" }),
    countActivatedEntities({ ...params, entityType: "part" }),
    countHistoricalWorkOrders(params),
    countHistoricalWorkOrderLines(params),
    countReviewItems(params),
    countReviewItems({ ...params, severity: "blocking" }),
  ]);

  const summaryText = [
    `Onboarding activation completed at ${completedAt}.`,
    `${customersActivated} staged customers and ${vehiclesActivated} staged vehicles were activated or matched to live records.`,
    `${partsActivated} parts and ${suppliersActivated} suppliers were activated or matched where safe.`,
    `${historicalWorkOrdersActivated} historical work orders and ${historicalWorkOrderLinesActivated} historical work order lines were imported into live ProFixIQ tables.`,
    `${openReviewItems} review items remain open, including ${blockingReviewItems} blocking items.`,
  ].join(" ");

  return {
    completedAt,
    completedBy: params.actorId,
    liveRecords: {
      customersActivated,
      vehiclesActivated,
      suppliersActivated,
      partsActivated,
      historicalWorkOrdersActivated,
      historicalWorkOrderLinesActivated,
    },
    review: {
      openReviewItems,
      blockingReviewItems,
    },
    assistantHandoff: {
      available: true,
      source: "onboarding_sessions.summary",
      summaryText,
    },
  };
}

export function mergeCompletionSummary(summary: unknown, completion: CompletionSummary): JsonObject {
  const base = summary !== null && typeof summary === "object" && !Array.isArray(summary)
    ? summary as JsonObject
    : {};

  return {
    ...base,
    completion,
    assistantHandoff: completion.assistantHandoff,
    liveRecordsCreated:
      completion.liveRecords.customersActivated
      + completion.liveRecords.vehiclesActivated
      + completion.liveRecords.suppliersActivated
      + completion.liveRecords.partsActivated
      + completion.liveRecords.historicalWorkOrdersActivated
      + completion.liveRecords.historicalWorkOrderLinesActivated,
  };
}
