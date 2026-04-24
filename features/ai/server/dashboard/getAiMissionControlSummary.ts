import type { Json } from "@shared/types/types/supabase";
import { ensureActorContext, fromTable } from "@/features/ai/server/types";
import type {
  AiMissionControlRecommendation,
  AiMissionControlSummary,
  GetAiMissionControlSummaryInput,
} from "@/features/ai/server/dashboard/types";

type RecommendationRow = {
  id: string;
  domain: string;
  recommendation_type: string;
  subject_type: string;
  subject_id: string | null;
  title: string;
  summary: string | null;
  status: "open" | "acknowledged" | "dismissed" | "resolved" | "expired" | "superseded";
  priority: "low" | "normal" | "high" | "urgent";
  risk_tier: "low" | "medium" | "high" | "critical";
  confidence: number | null;
  missing_data: Json;
  requires_approval: boolean;
  requires_owner_pin: boolean;
  created_at: string;
  expires_at: string | null;
  recommended_action: Json;
};

type PreviewCountRow = {
  recommendation_id: string | null;
};

function priorityRank(priority: RecommendationRow["priority"]): number {
  if (priority === "urgent") return 0;
  if (priority === "high") return 1;
  if (priority === "normal") return 2;
  return 3;
}

function riskRank(riskTier: RecommendationRow["risk_tier"]): number {
  if (riskTier === "critical") return 0;
  if (riskTier === "high") return 1;
  if (riskTier === "medium") return 2;
  return 3;
}

function missingDataCount(value: Json): number {
  return Array.isArray(value) ? value.length : 0;
}

function toRecommendedActionSummary(value: Json): {
  recommendedActionType: string | null;
  recommendedActionLabel: string | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { recommendedActionType: null, recommendedActionLabel: null };
  }

  const obj = value as Record<string, unknown>;
  const type = typeof obj.type === "string" ? obj.type : null;
  const label = typeof obj.label === "string"
    ? obj.label
    : typeof obj.title === "string"
      ? obj.title
      : null;

  return {
    recommendedActionType: type,
    recommendedActionLabel: label,
  };
}

function isStale(expiresAt: string | null, nowEpochMs: number): boolean {
  if (!expiresAt) return false;
  const epoch = Date.parse(expiresAt);
  if (!Number.isFinite(epoch)) return false;
  return epoch <= nowEpochMs;
}

function toMissionControlRecommendation(
  row: RecommendationRow,
  previewCount: number,
): AiMissionControlRecommendation {
  const action = toRecommendedActionSummary(row.recommended_action);
  const href = row.subject_type === "work_order" && row.subject_id ? `/work-orders/${row.subject_id}` : null;

  return {
    id: row.id,
    domain: row.domain,
    recommendationType: row.recommendation_type,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    priority: row.priority,
    riskTier: row.risk_tier,
    confidence: row.confidence,
    missingDataCount: missingDataCount(row.missing_data),
    requiresApproval: row.requires_approval,
    requiresOwnerPin: row.requires_owner_pin,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    recommendedActionType: action.recommendedActionType,
    recommendedActionLabel: action.recommendedActionLabel,
    previewCount,
    href,
  };
}

export async function getAiMissionControlSummary(
  input: GetAiMissionControlSummaryInput,
): Promise<AiMissionControlSummary> {
  const actor = ensureActorContext(input.actorContext);
  const domain = input.domain ?? "work_orders";
  const limit = Math.max(3, Math.min(input.limit ?? 5, 20));

  const { data, error } = await fromTable(input.supabase, "ai_recommendations")
    .select("id, domain, recommendation_type, subject_type, subject_id, title, summary, status, priority, risk_tier, confidence, missing_data, requires_approval, requires_owner_pin, created_at, expires_at, recommended_action")
    .eq("shop_id", actor.shopId)
    .eq("domain", domain)
    .in("status", ["open", "acknowledged"])
    .limit(200);

  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as RecommendationRow[]).sort((a, b) => {
    const priorityDelta = priorityRank(a.priority) - priorityRank(b.priority);
    if (priorityDelta !== 0) return priorityDelta;

    const riskDelta = riskRank(a.risk_tier) - riskRank(b.risk_tier);
    if (riskDelta !== 0) return riskDelta;

    return Date.parse(a.created_at) - Date.parse(b.created_at);
  });

  const recommendationIds = rows.map((row) => row.id);
  const previewCountByRecommendation = new Map<string, number>();

  if (recommendationIds.length > 0) {
    const { data: previewCounts, error: previewError } = await fromTable(input.supabase, "ai_action_previews")
      .select("recommendation_id")
      .eq("shop_id", actor.shopId)
      .eq("status", "ready")
      .in("recommendation_id", recommendationIds);

    if (!previewError) {
      for (const row of (previewCounts ?? []) as PreviewCountRow[]) {
        if (!row.recommendation_id) continue;
        const previous = previewCountByRecommendation.get(row.recommendation_id) ?? 0;
        previewCountByRecommendation.set(row.recommendation_id, previous + 1);
      }
    }
  }

  const nowEpochMs = Date.now();

  const totalOpen = rows.filter((row) => row.status === "open").length;
  const totalAcknowledged = rows.filter((row) => row.status === "acknowledged").length;
  const urgentCount = rows.filter((row) => row.priority === "urgent").length;
  const highCount = rows.filter((row) => row.priority === "high").length;
  const mediumRiskCount = rows.filter((row) => row.risk_tier === "medium").length;
  const highRiskCount = rows.filter((row) => row.risk_tier === "high" || row.risk_tier === "critical").length;
  const staleCount = rows.filter((row) => isStale(row.expires_at, nowEpochMs)).length;
  const missingDataRecommendations = rows.filter((row) => missingDataCount(row.missing_data) > 0);
  const workOrdersNeedingAttention = new Set(
    rows
      .filter((row) => row.subject_type === "work_order" && row.subject_id)
      .map((row) => row.subject_id as string),
  ).size;

  const recommendations = rows.slice(0, limit).map((row) =>
    toMissionControlRecommendation(row, previewCountByRecommendation.get(row.id) ?? 0),
  );

  const totalPreviewCount = recommendationIds.reduce(
    (sum, id) => sum + (previewCountByRecommendation.get(id) ?? 0),
    0,
  );

  return {
    totalOpen,
    totalAcknowledged,
    urgentCount,
    highCount,
    mediumRiskCount,
    highRiskCount,
    staleCount,
    missingDataCount: missingDataRecommendations.length,
    workOrdersNeedingAttention,
    totalPreviewCount,
    recommendations,
    generatedAt: new Date().toISOString(),
  };
}
