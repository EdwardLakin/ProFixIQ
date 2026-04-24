import type { Json } from "@shared/types/types/supabase";
import { ensureActorContext, fromTable, type AiActorContext, type AiServerClient } from "@/features/ai/server/types";

const MAX_WORK_ORDER_IDS = 100;

type RecommendationRow = {
  id: string;
  subject_id: string | null;
  status: "open" | "acknowledged";
  priority: "low" | "normal" | "high" | "urgent";
  risk_tier: "low" | "medium" | "high" | "critical";
  recommendation_type: string;
  title: string;
  created_at: string;
  missing_data: Json;
};

type PreviewRow = {
  recommendation_id: string | null;
};

export type WorkOrderRecommendationIndicator = {
  totalActive: number;
  urgentCount: number;
  highCount: number;
  acknowledgedCount: number;
  missingDataCount: number;
  highestPriority: "low" | "normal" | "high" | "urgent" | null;
  highestRiskTier: "low" | "medium" | "high" | "critical" | null;
  hasCloseoutRisk: boolean;
  hasPartsDelay: boolean;
  hasDispatchReview: boolean;
  hasPreviewReady: boolean;
  previewReadyCount: number;
  latestCreatedAt: string | null;
  topRecommendationTitle: string | null;
  topRecommendationType: string | null;
};

export type WorkOrderRecommendationIndicatorMap = Record<string, WorkOrderRecommendationIndicator>;

function priorityRank(priority: RecommendationRow["priority"]): number {
  if (priority === "urgent") return 4;
  if (priority === "high") return 3;
  if (priority === "normal") return 2;
  return 1;
}

function riskRank(riskTier: RecommendationRow["risk_tier"]): number {
  if (riskTier === "critical") return 4;
  if (riskTier === "high") return 3;
  if (riskTier === "medium") return 2;
  return 1;
}

function missingDataCount(value: Json): number {
  return Array.isArray(value) ? value.length : 0;
}

function isTypeMatch(row: RecommendationRow, prefix: string): boolean {
  return row.recommendation_type.startsWith(prefix);
}

function computeTopRecommendation(rows: RecommendationRow[]): RecommendationRow | null {
  if (rows.length === 0) return null;

  return [...rows].sort((a, b) => {
    const priorityDelta = priorityRank(b.priority) - priorityRank(a.priority);
    if (priorityDelta !== 0) return priorityDelta;

    const riskDelta = riskRank(b.risk_tier) - riskRank(a.risk_tier);
    if (riskDelta !== 0) return riskDelta;

    return Date.parse(b.created_at) - Date.parse(a.created_at);
  })[0] ?? null;
}

export function aggregateWorkOrderRecommendationIndicators(input: {
  recommendations: RecommendationRow[];
  previewRecommendationIds: ReadonlySet<string>;
}): WorkOrderRecommendationIndicatorMap {
  const grouped = new Map<string, RecommendationRow[]>();

  for (const row of input.recommendations) {
    const workOrderId = row.subject_id;
    if (!workOrderId) continue;
    const list = grouped.get(workOrderId) ?? [];
    list.push(row);
    grouped.set(workOrderId, list);
  }

  const indicators: WorkOrderRecommendationIndicatorMap = {};

  for (const [workOrderId, rows] of grouped.entries()) {
    const top = computeTopRecommendation(rows);

    let previewReadyCount = 0;
    let latestCreatedAt: string | null = null;

    for (const row of rows) {
      if (input.previewRecommendationIds.has(row.id)) {
        previewReadyCount += 1;
      }

      if (!latestCreatedAt || Date.parse(row.created_at) > Date.parse(latestCreatedAt)) {
        latestCreatedAt = row.created_at;
      }
    }

    indicators[workOrderId] = {
      totalActive: rows.length,
      urgentCount: rows.filter((row) => row.priority === "urgent").length,
      highCount: rows.filter((row) => row.priority === "high").length,
      acknowledgedCount: rows.filter((row) => row.status === "acknowledged").length,
      missingDataCount: rows.filter((row) => missingDataCount(row.missing_data) > 0).length,
      highestPriority: top?.priority ?? null,
      highestRiskTier: top?.risk_tier ?? null,
      hasCloseoutRisk: rows.some((row) => isTypeMatch(row, "closeout_risk_")),
      hasPartsDelay: rows.some((row) => isTypeMatch(row, "parts_delay_")),
      hasDispatchReview: rows.some((row) => isTypeMatch(row, "technician_dispatch_")),
      hasPreviewReady: previewReadyCount > 0,
      previewReadyCount,
      latestCreatedAt,
      topRecommendationTitle: top?.title ?? null,
      topRecommendationType: top?.recommendation_type ?? null,
    };
  }

  return indicators;
}

export async function getWorkOrderRecommendationIndicators(input: {
  supabase: AiServerClient;
  actorContext: AiActorContext;
  workOrderIds: string[];
}): Promise<WorkOrderRecommendationIndicatorMap> {
  const actor = ensureActorContext(input.actorContext);
  const workOrderIds = Array.from(new Set(input.workOrderIds.map((value) => value.trim()).filter(Boolean))).slice(0, MAX_WORK_ORDER_IDS);

  if (workOrderIds.length === 0) {
    return {};
  }

  const { data, error } = await fromTable(input.supabase, "ai_recommendations")
    .select("id, subject_id, status, priority, risk_tier, recommendation_type, title, created_at, missing_data")
    .eq("shop_id", actor.shopId)
    .eq("domain", "work_orders")
    .eq("subject_type", "work_order")
    .in("status", ["open", "acknowledged"])
    .in("subject_id", workOrderIds)
    .limit(Math.max(200, workOrderIds.length * 20));

  if (error) {
    throw new Error(`Failed to load work order recommendation indicators: ${error.message}`);
  }

  const recommendationRows = (data ?? []) as RecommendationRow[];
  const recommendationIds = recommendationRows.map((row) => row.id);

  const previewRecommendationIds = new Set<string>();

  if (recommendationIds.length > 0) {
    const { data: previewRows, error: previewError } = await fromTable(input.supabase, "ai_action_previews")
      .select("recommendation_id")
      .eq("shop_id", actor.shopId)
      .eq("status", "ready")
      .in("recommendation_id", recommendationIds);

    if (previewError) {
      throw new Error(`Failed to load recommendation previews: ${previewError.message}`);
    }

    for (const row of (previewRows ?? []) as PreviewRow[]) {
      if (!row.recommendation_id) continue;
      previewRecommendationIds.add(row.recommendation_id);
    }
  }

  return aggregateWorkOrderRecommendationIndicators({
    recommendations: recommendationRows,
    previewRecommendationIds,
  });
}
