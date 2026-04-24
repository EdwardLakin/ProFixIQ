import type { Database } from "@shared/types/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAiRecommendation,
  listAiRecommendationsForSubject,
  type AiActorContext,
  type AiRecommendationRecord,
} from "@/features/ai/server";
import { buildWorkOrderEvidenceSnapshot } from "./buildWorkOrderEvidenceSnapshot";
import { buildWorkOrderRecommendationsFromSnapshot } from "./workOrderRecommendationRules";
import { WORK_ORDER_RULES_VERSION } from "./types";

type DB = Database;

export async function generateWorkOrderEvidenceAndRecommendations(input: {
  supabase: SupabaseClient<DB>;
  actor: AiActorContext;
  workOrderId: string;
}): Promise<{
  evidenceSnapshot: Awaited<ReturnType<typeof buildWorkOrderEvidenceSnapshot>>["evidence"];
  recommendations: AiRecommendationRecord[];
  skippedDuplicates: string[];
  missingData: string[];
  warnings: string[];
}> {
  const { supabase, actor, workOrderId } = input;

  const { evidence, snapshot } = await buildWorkOrderEvidenceSnapshot({
    supabase,
    actor,
    workOrderId,
  });

  const drafts = buildWorkOrderRecommendationsFromSnapshot(snapshot);
  const existing = await listAiRecommendationsForSubject(supabase, actor, {
    subjectType: "work_order",
    subjectId: workOrderId,
    domain: "work_orders",
    limit: 200,
  });

  const openOrAcknowledged = new Set(
    existing
      .filter((row) => row.status === "open" || row.status === "acknowledged")
      .map((row) => row.recommendation_type),
  );

  const created: AiRecommendationRecord[] = [];
  const skippedDuplicates: string[] = [];

  for (const draft of drafts) {
    if (openOrAcknowledged.has(draft.recommendation_type)) {
      skippedDuplicates.push(draft.recommendation_type);
      continue;
    }

    const recommendation = await createAiRecommendation(supabase, actor, {
      domain: "work_orders",
      recommendationType: draft.recommendation_type,
      subjectType: "work_order",
      subjectId: workOrderId,
      title: draft.title,
      summary: draft.summary,
      priority: draft.priority,
      confidence: draft.confidence,
      riskTier: draft.risk_tier,
      evidenceSnapshotId: evidence.id,
      missingData: draft.missing_data,
      recommendedAction: draft.recommended_action,
      sideEffects: draft.side_effects,
      requiresApproval: draft.requires_approval,
      requiresOwnerPin: false,
      source: draft.source ?? "work_order_rules",
      expiresAt: draft.expires_at ?? null,
      metadata: {
        rules_version: WORK_ORDER_RULES_VERSION,
        ...draft.metadata,
      },
    });

    created.push(recommendation);
  }

  const warnings: string[] = [];
  if (drafts.length === 0) {
    warnings.push("no_rule_triggers");
  }

  return {
    evidenceSnapshot: evidence,
    recommendations: created,
    skippedDuplicates,
    missingData: snapshot.evidence_metadata.missing_data,
    warnings,
  };
}

export type { WorkOrderEvidenceSnapshot, WorkOrderRecommendationDraft } from "./types";
export { WORK_ORDER_RULES_VERSION } from "./types";
export { buildWorkOrderEvidenceSnapshot } from "./buildWorkOrderEvidenceSnapshot";
export { buildWorkOrderRecommendationsFromSnapshot } from "./workOrderRecommendationRules";
export { evaluateWorkOrderCloseoutRisk, buildCloseoutRiskRecommendations } from "./closeoutRiskRules";

export * from "./workOrderActionPreviews";
