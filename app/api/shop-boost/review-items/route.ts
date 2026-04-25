import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
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
  domain_counts: Record<string, number>;
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

  const admin = createAdminSupabase();
  let query = admin
    .from("shop_boost_review_items")
    .select("id,intake_id,domain,issue_type,summary,raw_payload,normalized_payload,target_domain,blocking_reason,dependency_refs,downstream_impact_count,cluster_key,cluster_confidence,suggested_matches,status,resolution_action,ignore_reason_code,ignore_note,ignored_at,resolved_at,materialized_at,materialization_error,materialized_record,created_at,recommended_action,recommendation_reason,recommendation_confidence,candidate_targets,recommendation_seen_at,recommendation_followed")
    .eq("shop_id", profile.shop_id)
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

  const intakeId = String(items[0]?.intake_id ?? "");
  const knownStatuses = ["pending", "failed_materialization", "materialized", "ignored", "resolved"] as const;
  const knownDomains = ["customer", "vehicle", "work_order", "history", "invoice", "part"] as const;
  const countByStatusPromises = knownStatuses.map((state) =>
    admin
      .from("shop_boost_review_items")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", profile.shop_id)
      .eq("intake_id", intakeId)
      .eq("status", state),
  );
  const countByDomainPromises = knownDomains.map((value) =>
    admin
      .from("shop_boost_review_items")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", profile.shop_id)
      .eq("intake_id", intakeId)
      .eq("domain", value),
  );
  const [statusCountRows, domainCountRows, rowResultsTotal, reviewRequiredCount, failedCount, linkedCount] = await Promise.all([
    Promise.all(countByStatusPromises),
    Promise.all(countByDomainPromises),
    admin
      .from("shop_boost_row_results")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", profile.shop_id)
      .eq("intake_id", intakeId),
    admin
      .from("shop_boost_row_results")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", profile.shop_id)
      .eq("intake_id", intakeId)
      .eq("review_required", true),
    admin
      .from("shop_boost_row_results")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", profile.shop_id)
      .eq("intake_id", intakeId)
      .eq("review_required", false)
      .or("error_reason.not.is.null,match_status.eq.invalid"),
    admin
      .from("shop_boost_row_results")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", profile.shop_id)
      .eq("intake_id", intakeId)
      .eq("review_required", false)
      .is("error_reason", null)
      .in("match_status", ["matched_existing", "partial_match"]),
  ]);
  const statusCounts = knownStatuses.reduce<Record<string, number>>((acc, key, idx) => {
    acc[key] = Number(statusCountRows[idx]?.count ?? 0);
    return acc;
  }, {});
  const domainCounts = knownDomains.reduce<Record<string, number>>((acc, key, idx) => {
    acc[key] = Number(domainCountRows[idx]?.count ?? 0);
    return acc;
  }, {});
  const totalInput = Number(rowResultsTotal.count ?? 0);
  const reviewRequired = Number(reviewRequiredCount.count ?? 0);
  const failed = Number(failedCount.count ?? 0);
  const linked = Number(linkedCount.count ?? 0);
  const ignored = statusCounts.ignored ?? 0;
  const materialized = Math.max(0, totalInput - reviewRequired - failed - linked - ignored);
  const totalCounted = materialized + linked + ignored + reviewRequired + failed;
  const rowAccounting = {
    total_input: totalInput,
    materialized,
    linked,
    ignored,
    review_required: reviewRequired,
    failed,
    total_counted: totalCounted,
    mismatch: Math.max(0, totalInput - totalCounted),
  };

  const unresolved = items.filter((item) => item.status === "pending" || item.status === "failed_materialization");
  const blockers = unresolved.filter((item) => Boolean(item.blocking_reason)).length;
  const highRiskActions = items.filter((item) => Boolean(asRecord(item.materialized_record).high_risk_action)).length;

  const { data: intake } = await admin
    .from("shop_boost_intakes")
    .select("intake_basics")
    .eq("shop_id", profile.shop_id)
    .eq("id", String(items[0]?.intake_id ?? ""))
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

  return NextResponse.json({
    ok: true,
    items,
    summary: {
      domain_counts: domainCounts,
      status_counts: statusCounts,
      unresolved_total: (statusCounts.pending ?? 0) + (statusCounts.failed_materialization ?? 0),
      blockers_total: blockers,
      row_accounting: rowAccounting,
    } satisfies ReviewCountsSummary,
    guidance: {
      is_operational_ready: ((statusCounts.pending ?? 0) + (statusCounts.failed_materialization ?? 0)) === 0 && integrityErrors.length === 0,
      operational_blockers_count: blockers,
      non_blocking_issues_count: Math.max(0, ((statusCounts.pending ?? 0) + (statusCounts.failed_materialization ?? 0)) - blockers),
      high_risk_actions_count: highRiskActions,
      integrity_errors: integrityErrors,
    },
  });
}
