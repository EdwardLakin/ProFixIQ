import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildCanonicalIntakeTruth } from "@/features/integrations/shopBoost/canonicalTruth";
import { confidenceLabelFromScore, deriveReviewRecommendation, type RecommendedAction, type ReviewRecommendation } from "@/features/integrations/shopBoost/reviewGuidance";

type DB = Database;
type RecommendationDto = ReviewRecommendation;
type ReviewItemRow = Pick<
  DB["public"]["Tables"]["shop_boost_review_items"]["Row"],
  "id" | "intake_id" | "domain" | "issue_type" | "summary" | "raw_payload" | "normalized_payload" | "target_domain" | "blocking_reason" | "dependency_refs" | "downstream_impact_count" | "cluster_key" | "cluster_confidence" | "suggested_matches" | "status" | "resolution_action" | "ignore_reason_code" | "ignore_note" | "ignored_at" | "resolved_at" | "materialized_at" | "materialization_error" | "materialized_record" | "created_at" | "recommended_action" | "recommendation_reason" | "recommendation_confidence" | "candidate_targets" | "recommendation_seen_at" | "recommendation_followed"
>;
type ReviewDecisionTransparency = {
  confidence_score: number;
  reasoning: string;
  candidates: RecommendationDto["candidateTargets"];
  raw_data: Record<string, unknown>;
  normalized_data: Record<string, unknown>;
};
type ReviewListItem = ReviewItemRow & {
  recommendation: RecommendationDto;
  affected_domains: string[];
  review_explanation: string;
  recommendation_explanation: string;
  decision_transparency: ReviewDecisionTransparency;
};
type ReviewCountsSummary = {
  intake_id: string | null;
  domain_counts: Record<string, number>;
  lifecycle: readonly string[];
  by_domain_lifecycle: Record<string, unknown>;
  reason_counts: Record<string, number>;
  status_counts: Record<string, number>;
  unresolved_total: number;
  blockers_total: number;
  row_accounting: {
    total_input: number;
    materialized: number;
    linked: number;
    ignored: number;
    review_required: number;
    failed: number;
    total_counted: number;
    mismatch: number;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function deriveAffectedDomains(dependencyRefs: unknown, domain: string): string[] {
  const refs = asRecord(dependencyRefs);
  const domains = new Set<string>([domain]);
  const tokens = JSON.stringify(refs).toLowerCase();
  if (tokens.includes("work_order")) domains.add("work_order");
  if (tokens.includes("invoice")) domains.add("invoice");
  if (tokens.includes("vehicle")) domains.add("vehicle");
  if (tokens.includes("customer")) domains.add("customer");
  if (tokens.includes("part")) domains.add("part");
  if (tokens.includes("history")) domains.add("history");
  return Array.from(domains);
}

function toRecommendedAction(value: unknown): RecommendedAction {
  if (value === "link_existing" || value === "create_new" || value === "merge_candidate" || value === "ignore") {
    return value;
  }
  return "create_new";
}

function deriveReviewExplanation(item: Record<string, unknown>): string {
  const domain = String(item.domain ?? "record");
  const issueType = String(item.issue_type ?? "ambiguous_match");
  if (issueType === "missing_dependency") {
    return `This ${domain} could not be linked because a required dependency was missing from imported data.`;
  }
  if (issueType === "invalid") {
    return `This ${domain} is missing required identifiers, so it cannot be safely materialized yet.`;
  }
  if (issueType === "duplicate_candidate" || issueType === "conflict") {
    return `This ${domain} matches multiple existing records with conflicting similarity signals.`;
  }
  return `This ${domain} needs review because matching confidence did not clear the auto-apply threshold.`;
}

function deriveRecommendationExplanation(recommendation: RecommendationDto): string {
  const topCandidate = recommendation.candidateTargets[0];
  if (recommendation.recommendedAction === "link_existing" && topCandidate) {
    return `We suggest linking to ${topCandidate.label} based on deterministic identity and similarity scoring (${Math.round(topCandidate.score * 100)}%).`;
  }
  if (recommendation.recommendedAction === "merge_candidate") {
    return "We suggest a merge workflow because duplicate indicators exceeded the merge threshold, but manual confirmation is required.";
  }
  if (recommendation.recommendedAction === "ignore") {
    return "We suggest ignoring this row because data confidence is too low for safe linking or creation.";
  }
  return `${recommendation.recommendationReason} Confidence ${Math.round(recommendation.recommendationConfidence * 100)}%.`;
}

export async function GET(req: Request) {
  const supabaseUser = createRouteHandlerClient<DB>({ cookies });
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();

  if (!user?.id) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabaseUser
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null }>();

  if (!profile?.shop_id) return NextResponse.json({ ok: false, error: "No shop linked." }, { status: 400 });

  const url = new URL(req.url);
  const domain = url.searchParams.get("domain");
  const status = url.searchParams.get("status") ?? "pending";
  const requestedIntakeId = String(url.searchParams.get("intakeId") ?? "").trim();

  const admin = createAdminSupabase();

  const resolvedIntakeId = requestedIntakeId
    ? requestedIntakeId
    : String(
        (
          await admin
            .from("shop_boost_intakes")
            .select("id")
            .eq("shop_id", profile.shop_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle<{ id: string }>()
        ).data?.id ?? "",
      );

  if (!resolvedIntakeId) {
    return NextResponse.json({
      ok: true,
      items: [],
      summary: {
        intake_id: null,
        domain_counts: { customer: 0, vehicle: 0, work_order: 0, history: 0, invoice: 0, part: 0 },
        lifecycle: [],
        by_domain_lifecycle: {},
        reason_counts: {},
        status_counts: { pending: 0, failed_materialization: 0, materialized: 0, ignored: 0, resolved: 0 },
        unresolved_total: 0,
        blockers_total: 0,
        row_accounting: {
          total_input: 0,
          materialized: 0,
          linked: 0,
          ignored: 0,
          review_required: 0,
          failed: 0,
          total_counted: 0,
          mismatch: 0,
        },
      } satisfies ReviewCountsSummary,
      guidance: {
        state: "empty_reset",
        is_operational_ready: false,
        operational_blockers_count: 0,
        non_blocking_issues_count: 0,
        high_risk_actions_count: 0,
        integrity_errors: [],
      },
    });
  }

  let query = admin
    .from("shop_boost_review_items")
    .select("id,intake_id,domain,issue_type,summary,raw_payload,normalized_payload,target_domain,blocking_reason,dependency_refs,downstream_impact_count,cluster_key,cluster_confidence,suggested_matches,status,resolution_action,ignore_reason_code,ignore_note,ignored_at,resolved_at,materialized_at,materialization_error,materialized_record,created_at,recommended_action,recommendation_reason,recommendation_confidence,candidate_targets,recommendation_seen_at,recommendation_followed")
    .eq("shop_id", profile.shop_id)
    .eq("intake_id", resolvedIntakeId)
    .order("created_at", { ascending: false })
    .limit(250);

  if (domain) query = query.eq("domain", domain);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const items: ReviewListItem[] = (data ?? []).map((item: ReviewItemRow) => {
    const recommendation = item.recommended_action
      ? {
          recommendedAction: toRecommendedAction(item.recommended_action),
          recommendationReason: String(item.recommendation_reason ?? ""),
          recommendationConfidence: Number(item.recommendation_confidence ?? 0),
          candidateTargets: Array.isArray(item.candidate_targets) ? item.candidate_targets as RecommendationDto["candidateTargets"] : [],
          confidenceLabel: confidenceLabelFromScore(Number(item.recommendation_confidence ?? 0)),
          requiresManualReview: Number(item.recommendation_confidence ?? 0) < 0.85,
          blockedAutoApply: Number(item.recommendation_confidence ?? 0) < 0.85,
        } satisfies RecommendationDto
      : deriveReviewRecommendation({
          domain: String(item.domain ?? ""),
          issueType: String(item.issue_type ?? "ambiguous_match"),
          rawPayload: asRecord(item.raw_payload),
          normalizedPayload: asRecord(item.normalized_payload),
          suggestedMatches: item.suggested_matches,
          clusterConfidence: Number(item.cluster_confidence ?? 0),
        });

    return {
      ...item,
      recommendation,
      affected_domains: deriveAffectedDomains(item.dependency_refs, String(item.domain ?? "")),
      review_explanation: deriveReviewExplanation(item),
      recommendation_explanation: deriveRecommendationExplanation(recommendation),
      decision_transparency: {
        confidence_score: Number(recommendation.recommendationConfidence ?? 0),
        reasoning: String(recommendation.recommendationReason ?? ""),
        candidates: recommendation.candidateTargets,
        raw_data: asRecord(item.raw_payload),
        normalized_data: asRecord(item.normalized_payload),
      },
    };
  });

  const canonicalTruth = await buildCanonicalIntakeTruth({
    admin: admin as any,
    shopId: profile.shop_id,
    intakeId: resolvedIntakeId,
  });

  const unresolved = items.filter((item) => item.status === "pending" || item.status === "failed_materialization");
  const blockers = unresolved.filter((item) => Boolean(item.blocking_reason)).length;
  const highRiskActions = items.filter((item) => Boolean(asRecord(item.materialized_record).high_risk_action)).length;

  const { data: intake } = await admin
    .from("shop_boost_intakes")
    .select("intake_basics")
    .eq("shop_id", profile.shop_id)
    .eq("id", resolvedIntakeId)
    .maybeSingle();
  const migration = asRecord(asRecord(intake?.intake_basics).migrationProgress);
  const integrity = asRecord(migration.integrity);
  const integrityErrors = Array.isArray(integrity.integrity_errors)
    ? integrity.integrity_errors
    : [];

  if (unresolved.length > 0) {
    await admin
      .from("shop_boost_review_items")
      .update({ recommendation_seen_at: new Date().toISOString() })
      .in(
        "id",
        unresolved.map((item) => item.id),
      )
      .is("recommendation_seen_at", null);
  }

  const state =
    canonicalTruth.readiness === "empty"
      ? "empty_reset"
      : canonicalTruth.readiness === "review_required"
        ? "review_required"
        : canonicalTruth.readiness === "blocked"
          ? "failed_inconsistent"
          : "complete";

  return NextResponse.json({
    ok: true,
    intakeId: resolvedIntakeId,
    items,
    summary: {
      intake_id: resolvedIntakeId,
      domain_counts: canonicalTruth.domainCounts,
      lifecycle: canonicalTruth.lifecycle,
      by_domain_lifecycle: canonicalTruth.byDomain,
      reason_counts: canonicalTruth.reasons,
      status_counts: {
        pending: canonicalTruth.review.pending,
        failed_materialization: canonicalTruth.review.failedMaterialization,
        materialized: canonicalTruth.review.materialized,
        ignored: canonicalTruth.review.ignored,
        resolved: canonicalTruth.review.resolved,
      },
      unresolved_total: canonicalTruth.review.pending + canonicalTruth.review.failedMaterialization,
      blockers_total: blockers,
      row_accounting: {
        total_input: canonicalTruth.rowCounts.total,
        materialized: canonicalTruth.rowCounts.materialized,
        linked: canonicalTruth.rowCounts.linked,
        ignored: canonicalTruth.rowCounts.ignored,
        review_required: canonicalTruth.rowCounts.unresolved,
        failed: canonicalTruth.rowCounts.failed,
        total_counted: canonicalTruth.rowCounts.totalCounted,
        mismatch: canonicalTruth.rowCounts.mismatch,
      },
    } satisfies ReviewCountsSummary,
    guidance: {
      state,
      is_operational_ready:
        state === "complete" &&
        integrityErrors.length === 0,
      operational_blockers_count: blockers,
      non_blocking_issues_count: Math.max(0, canonicalTruth.rowCounts.unresolved - blockers),
      high_risk_actions_count: highRiskActions,
      integrity_errors: integrityErrors,
      materialized_entities: canonicalTruth.materializedEntities,
      canonical_readiness: canonicalTruth.readiness,
      integrity_flags: canonicalTruth.integrityFlags,
    },
  });
}
