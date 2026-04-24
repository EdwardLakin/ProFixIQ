import type { Json } from "@shared/types/types/supabase";
import { ensureActorContext, fromTable, type AiActorContext, type AiServerClient } from "@/features/ai/server/types";

const FRESH_MAX_HOURS = 24;
const AGING_MAX_HOURS = 72;

export type WorkOrderAiFreshnessStatus =
  | "fresh"
  | "aging"
  | "stale"
  | "missing"
  | "needs_refresh";

export type WorkOrderAiFreshnessDto = {
  workOrderId: string;
  status: WorkOrderAiFreshnessStatus;
  label: string;
  description: string;
  generatedAt: string | null;
  latestEvidenceAt: string | null;
  latestRecommendationAt: string | null;
  openRecommendationCount: number;
  acknowledgedRecommendationCount: number;
  staleRecommendationCount: number;
  expiredRecommendationCount: number;
  missingDataCount: number;
  hasPreviewReady: boolean;
  canRefresh: boolean;
};

type EvidenceRow = {
  created_at: string;
  freshness_at: string | null;
  missing_data: Json;
};

type RecommendationRow = {
  id: string;
  created_at: string;
  status: "open" | "acknowledged" | "dismissed" | "resolved" | "expired" | "superseded";
  expires_at: string | null;
  missing_data: Json;
};

type PreviewRow = {
  recommendation_id: string | null;
};

type EvaluateInput = {
  workOrderId: string;
  generatedAt: string;
  evidenceRows: EvidenceRow[];
  recommendationRows: RecommendationRow[];
  previewRows: PreviewRow[];
};

function parseTime(value: string | null): number | null {
  if (!value) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? epoch : null;
}

function countMissing(value: Json): number {
  return Array.isArray(value) ? value.length : 0;
}

function hoursSince(nowMs: number, iso: string | null): number | null {
  const parsed = parseTime(iso);
  if (parsed == null) return null;
  return Math.max(0, (nowMs - parsed) / (1000 * 60 * 60));
}

function toRelative(ageHours: number | null): string | null {
  if (ageHours == null) return null;
  if (ageHours < 1) return "just now";
  if (ageHours < 24) return `${Math.round(ageHours)}h ago`;
  const days = Math.round(ageHours / 24);
  return `${days}d ago`;
}

export function evaluateWorkOrderAiFreshness(input: EvaluateInput): WorkOrderAiFreshnessDto {
  const nowMs = parseTime(input.generatedAt) ?? Date.now();

  const latestEvidenceAt =
    input.evidenceRows
      .map((row) => row.freshness_at ?? row.created_at)
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

  const latestRecommendationAt =
    input.recommendationRows
      .map((row) => row.created_at)
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

  const openRecommendations = input.recommendationRows.filter((row) => row.status === "open");
  const acknowledgedRecommendations = input.recommendationRows.filter((row) => row.status === "acknowledged");
  const activeRecommendations = input.recommendationRows.filter(
    (row) => row.status === "open" || row.status === "acknowledged",
  );

  const staleRecommendationCount = activeRecommendations.filter((row) => {
    const expiresAt = parseTime(row.expires_at);
    return expiresAt != null && expiresAt <= nowMs;
  }).length;

  const expiredRecommendationCount = input.recommendationRows.filter((row) => row.status === "expired").length;

  const missingDataCount =
    activeRecommendations.reduce((sum, row) => sum + countMissing(row.missing_data), 0) +
    input.evidenceRows.reduce((sum, row) => sum + countMissing(row.missing_data), 0);

  const activeRecommendationIds = new Set(activeRecommendations.map((row) => row.id));
  const hasPreviewReady = input.previewRows.some((row) => {
    if (!row.recommendation_id) return false;
    return activeRecommendationIds.has(row.recommendation_id);
  });

  const noEvidence = input.evidenceRows.length === 0;
  const noRecommendations = input.recommendationRows.length === 0;
  const evidenceAgeHours = hoursSince(nowMs, latestEvidenceAt);
  const latestSignalAt = [latestEvidenceAt, latestRecommendationAt]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  const latestSignalAgeHours = hoursSince(nowMs, latestSignalAt);

  const hasPartialSignals = (noEvidence && !noRecommendations) || (!noEvidence && noRecommendations);
  const hasExpiredOrMissingData = expiredRecommendationCount > 0 || missingDataCount > 0;

  let status: WorkOrderAiFreshnessStatus = "fresh";

  if (noEvidence && noRecommendations) {
    status = "missing";
  } else if (hasPartialSignals || hasExpiredOrMissingData) {
    status = "needs_refresh";
  } else if ((evidenceAgeHours ?? 0) > AGING_MAX_HOURS || staleRecommendationCount > 0 || (latestSignalAgeHours ?? 0) > AGING_MAX_HOURS) {
    status = "stale";
  } else if ((latestSignalAgeHours ?? 0) > FRESH_MAX_HOURS) {
    status = "aging";
  }

  const labelByStatus: Record<WorkOrderAiFreshnessStatus, string> = {
    fresh: "Fresh",
    aging: "Aging",
    stale: "Stale",
    missing: "Missing",
    needs_refresh: "Needs refresh",
  };

  const relative = toRelative(latestSignalAgeHours);

  const description =
    status === "missing"
      ? "No AI evidence or recommendations yet."
      : status === "needs_refresh"
        ? "AI context has gaps or expired signals; review and refresh is recommended."
        : status === "stale"
          ? `AI signals are stale${relative ? ` (updated ${relative})` : ""}.`
          : status === "aging"
            ? `AI signals are aging${relative ? ` (updated ${relative})` : ""}.`
            : `AI signals updated ${relative ?? "recently"}.`;

  return {
    workOrderId: input.workOrderId,
    status,
    label: labelByStatus[status],
    description,
    generatedAt: input.generatedAt,
    latestEvidenceAt,
    latestRecommendationAt,
    openRecommendationCount: openRecommendations.length,
    acknowledgedRecommendationCount: acknowledgedRecommendations.length,
    staleRecommendationCount,
    expiredRecommendationCount,
    missingDataCount,
    hasPreviewReady,
    canRefresh: status !== "fresh",
  };
}

export async function getWorkOrderAiFreshness(input: {
  supabase: AiServerClient;
  actorContext: AiActorContext;
  workOrderId: string;
}): Promise<WorkOrderAiFreshnessDto> {
  const actor = ensureActorContext(input.actorContext);
  const workOrderId = input.workOrderId.trim();
  const generatedAt = new Date().toISOString();

  if (!workOrderId) {
    throw new Error("workOrderId is required");
  }

  const [evidenceResult, recommendationResult] = await Promise.all([
    fromTable(input.supabase, "ai_evidence_snapshots")
      .select("created_at, freshness_at, missing_data")
      .eq("shop_id", actor.shopId)
      .eq("domain", "work_orders")
      .eq("subject_type", "work_order")
      .eq("subject_id", workOrderId)
      .order("created_at", { ascending: false })
      .limit(25),
    fromTable(input.supabase, "ai_recommendations")
      .select("id, created_at, status, expires_at, missing_data")
      .eq("shop_id", actor.shopId)
      .eq("domain", "work_orders")
      .eq("subject_type", "work_order")
      .eq("subject_id", workOrderId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (evidenceResult.error) {
    throw new Error(`Failed to load work-order evidence freshness: ${evidenceResult.error.message}`);
  }

  if (recommendationResult.error) {
    throw new Error(`Failed to load work-order recommendation freshness: ${recommendationResult.error.message}`);
  }

  const recommendations = (recommendationResult.data ?? []) as RecommendationRow[];
  const recommendationIds = recommendations.map((row) => row.id);

  let previewRows: PreviewRow[] = [];

  if (recommendationIds.length > 0) {
    const { data: previews, error: previewError } = await fromTable(input.supabase, "ai_action_previews")
      .select("recommendation_id")
      .eq("shop_id", actor.shopId)
      .eq("status", "ready")
      .in("recommendation_id", recommendationIds)
      .limit(100);

    if (previewError) {
      throw new Error(`Failed to load work-order preview readiness: ${previewError.message}`);
    }

    previewRows = (previews ?? []) as PreviewRow[];
  }

  return evaluateWorkOrderAiFreshness({
    workOrderId,
    generatedAt,
    evidenceRows: (evidenceResult.data ?? []) as EvidenceRow[],
    recommendationRows: recommendations,
    previewRows,
  });
}
