import type { Database, Json } from "@shared/types/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listAiEvidenceSnapshotsForSubject, listAiRecommendationsForSubject, type AiActorContext } from "@/features/ai/server";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type RiskTier = "low" | "medium" | "high" | "critical";

type CloseoutGatePreviewItem = {
  recommendationId: string;
  title: string;
  severity: RiskTier;
  reason: string;
  recommendedNextStep: string;
  missingData: string[];
  source: string;
  status: string;
  wouldBlockIfEnabled: boolean;
};

export type WorkOrderCloseoutGatePreviewDto = {
  workOrderId: string;
  mode: "preview_only";
  enabled: false;
  wouldBlockIfEnabled: boolean;
  blockingCandidateCount: number;
  advisoryCount: number;
  missingDataCount: number;
  highestSeverity: RiskTier | null;
  generatedAt: string | null;
  freshnessAt: string | null;
  stale: boolean;
  items: CloseoutGatePreviewItem[];
  executionBlocked: true;
  closeoutCurrentlyBlocked: false;
  emptyStateHint?: string;
};

function asObject(value: Json): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asStringArray(value: Json): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function isCloseoutGateRecommendationType(type: string): boolean {
  return type.startsWith("closeout_risk_") || type === "ready_for_closeout_review";
}

function riskRank(value: RiskTier): number {
  if (value === "critical") return 4;
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function computeHighestSeverity(items: CloseoutGatePreviewItem[]): RiskTier | null {
  if (items.length === 0) return null;
  return [...items]
    .sort((a, b) => riskRank(b.severity) - riskRank(a.severity))[0]?.severity ?? null;
}

function parseIso(value: string | null): number | null {
  if (!value) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? epoch : null;
}

function isStale(input: { expiresAt: string | null; freshnessAt: string | null; nowMs: number }): boolean {
  const expiresAtMs = parseIso(input.expiresAt);
  if (expiresAtMs != null && expiresAtMs <= input.nowMs) return true;

  const freshnessMs = parseIso(input.freshnessAt);
  if (freshnessMs == null) return false;

  const ageMs = input.nowMs - freshnessMs;
  return ageMs > 24 * 60 * 60 * 1000;
}

async function getShopScopedWorkOrder(input: {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
  shopId: string;
}): Promise<WorkOrderRow | null> {
  const { data, error } = await input.supabase
    .from("work_orders")
    .select("id, shop_id")
    .eq("id", input.workOrderId)
    .eq("shop_id", input.shopId)
    .maybeSingle<Pick<WorkOrderRow, "id" | "shop_id">>();

  if (error) throw new Error(error.message);
  return data as WorkOrderRow | null;
}

export async function getWorkOrderCloseoutGatePreview(input: {
  supabase: SupabaseClient<DB>;
  actor: AiActorContext;
  workOrderId: string;
}): Promise<WorkOrderCloseoutGatePreviewDto | null> {
  const scopedWorkOrder = await getShopScopedWorkOrder({
    supabase: input.supabase,
    workOrderId: input.workOrderId,
    shopId: input.actor.shopId,
  });

  if (!scopedWorkOrder) return null;

  const [recommendations, evidenceSnapshots] = await Promise.all([
    listAiRecommendationsForSubject(input.supabase, input.actor, {
      subjectType: "work_order",
      subjectId: input.workOrderId,
      domain: "work_orders",
      limit: 150,
    }),
    listAiEvidenceSnapshotsForSubject(input.supabase, input.actor, {
      subjectType: "work_order",
      subjectId: input.workOrderId,
      domain: "work_orders",
      limit: 1,
    }),
  ]);

  const nowMs = Date.now();
  const latestEvidence = evidenceSnapshots[0] ?? null;

  const previewItems: CloseoutGatePreviewItem[] = recommendations
    .filter((row) => (row.status === "open" || row.status === "acknowledged") && isCloseoutGateRecommendationType(row.recommendation_type))
    .map((row) => {
      const metadata = asObject(row.metadata);
      const recommendedAction = asObject(row.recommended_action);
      const wouldBlockIfEnabled = metadata.would_block_closeout_future === true || metadata.blocks_closeout === true;
      const recommendedNextStep =
        typeof recommendedAction.details === "string"
          ? recommendedAction.details
          : typeof recommendedAction.label === "string"
            ? recommendedAction.label
            : "Review closeout readiness in existing advisor workflow.";

      return {
        recommendationId: row.id,
        title: row.title,
        severity: row.risk_tier,
        reason: row.summary ?? "Closeout review signal detected.",
        recommendedNextStep,
        missingData: asStringArray(row.missing_data),
        source: typeof row.source === "string" && row.source.trim().length > 0 ? row.source : "work_order_rules",
        status: row.status,
        wouldBlockIfEnabled,
      };
    });

  const blockingCandidateCount = previewItems.filter((item) => item.wouldBlockIfEnabled).length;
  const advisoryCount = previewItems.filter((item) => !item.wouldBlockIfEnabled).length;
  const missingDataCount = previewItems.reduce((sum, item) => sum + item.missingData.length, 0);
  const generatedAt = latestEvidence?.created_at ?? recommendations[0]?.created_at ?? null;
  const freshnessAt = latestEvidence?.freshness_at ?? null;

  const latestRecommendationExpiresAt = recommendations
    .filter((row) => (row.status === "open" || row.status === "acknowledged") && isCloseoutGateRecommendationType(row.recommendation_type))
    .map((row) => row.expires_at)
    .find((value) => Boolean(value)) ?? null;

  const stale = isStale({
    expiresAt: latestRecommendationExpiresAt,
    freshnessAt,
    nowMs,
  });

  return {
    workOrderId: input.workOrderId,
    mode: "preview_only",
    enabled: false,
    wouldBlockIfEnabled: blockingCandidateCount > 0,
    blockingCandidateCount,
    advisoryCount,
    missingDataCount,
    highestSeverity: computeHighestSeverity(previewItems),
    generatedAt,
    freshnessAt,
    stale,
    items: previewItems,
    executionBlocked: true,
    closeoutCurrentlyBlocked: false,
    ...(previewItems.length === 0
      ? {
          emptyStateHint:
            "No closeout preview recommendations yet. Use the work-order AI operational recommendations panel to generate a fresh review.",
        }
      : {}),
  };
}
