import type { Database } from "@shared/types/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAiRecommendation, fromTable, type AiActorContext, type AiRecommendationRecord } from "@/features/ai/server";
import { createShopBoostPostActivationEvidenceSnapshot } from "./buildShopBoostEvidenceSnapshot";
import { buildShopBoostPostActivationRecommendations } from "./shopBoostRecommendationRules";
import { SHOP_BOOST_RULES_VERSION } from "./types";

type DB = Database;

async function hasOpenDuplicate(input: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  recommendationType: string;
  subjectId: string | null;
  intakeId: string;
  sourceRunId: string | null;
}): Promise<boolean> {
  let query = fromTable(input.supabase, "ai_recommendations")
    .select("id", { head: true, count: "exact" })
    .eq("shop_id", input.shopId)
    .eq("domain", "shop_boost")
    .eq("subject_type", "shop_boost_intake")
    .eq("recommendation_type", input.recommendationType)
    .in("status", ["open", "acknowledged"])
    .limit(1);

  if (input.subjectId) {
    query = query.eq("subject_id", input.subjectId);
  } else {
    query = query.is("subject_id", null).contains("metadata", { intakeId: input.intakeId });
    if (input.sourceRunId) {
      query = query.eq("source_run_id", input.sourceRunId);
    }
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function generateShopBoostPostActivationEvidenceAndRecommendations(input: {
  supabase: SupabaseClient<DB>;
  actor: AiActorContext;
  intakeId?: string | null;
  sourceRunId?: string | null;
}): Promise<{
  evidenceSnapshot: Awaited<ReturnType<typeof createShopBoostPostActivationEvidenceSnapshot>>["evidence"];
  recommendations: AiRecommendationRecord[];
  skippedDuplicates: string[];
  missingData: string[];
  warnings: string[];
}> {
  const { supabase, actor } = input;

  const built = await createShopBoostPostActivationEvidenceSnapshot({
    supabase,
    actorContext: actor,
    intakeId: input.intakeId,
    sourceRunId: input.sourceRunId,
  });

  const drafts = buildShopBoostPostActivationRecommendations({
    evidence: built.snapshot,
    evidenceSnapshotId: built.evidence.id,
  });

  const created: AiRecommendationRecord[] = [];
  const skippedDuplicates: string[] = [];

  for (const draft of drafts) {
    const duplicate = await hasOpenDuplicate({
      supabase,
      shopId: actor.shopId,
      recommendationType: draft.recommendation_type,
      subjectId: built.evidence.subject_id,
      intakeId: built.snapshot.intakeId,
      sourceRunId: built.snapshot.sourceRunId,
    });

    if (duplicate) {
      skippedDuplicates.push(draft.recommendation_type);
      continue;
    }

    const recommendation = await createAiRecommendation(supabase, actor, {
      domain: "shop_boost",
      recommendationType: draft.recommendation_type,
      subjectType: "shop_boost_intake",
      subjectId: built.evidence.subject_id,
      title: draft.title,
      summary: draft.summary,
      priority: draft.priority,
      confidence: draft.confidence,
      riskTier: draft.risk_tier,
      evidenceSnapshotId: draft.evidence_snapshot_id,
      missingData: draft.missing_data,
      recommendedAction: draft.recommended_action,
      sideEffects: draft.side_effects,
      requiresApproval: draft.requires_approval,
      requiresOwnerPin: false,
      source: draft.source,
      sourceRunId: built.snapshot.sourceRunId,
      expiresAt: draft.expires_at,
      metadata: {
        ...draft.metadata,
        rules_version: SHOP_BOOST_RULES_VERSION,
      },
    });

    created.push(recommendation);
  }

  return {
    evidenceSnapshot: built.evidence,
    recommendations: created,
    skippedDuplicates,
    missingData: built.missingData,
    warnings: drafts.length === 0 ? ["no_rule_triggers"] : [],
  };
}

export * from "./types";
export * from "./buildShopBoostEvidenceSnapshot";
export * from "./shopBoostRecommendationRules";

export * from "./shopBoostActionPreviews";
