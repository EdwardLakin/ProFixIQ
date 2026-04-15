import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { deriveReviewRecommendation } from "@/features/integrations/shopBoost/reviewGuidance";

type DB = Database;

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

function deriveRecommendationExplanation(
  recommendation: {
    recommendedAction: string;
    recommendationReason: string;
    recommendationConfidence: number;
    candidateTargets: Array<{ id: string; label: string; score: number }>;
  },
): string {
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

  const admin = createAdminSupabase() as any;
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

  const items = (data ?? []).map((item: Record<string, unknown>) => {
    const recommendation = item.recommended_action
      ? {
          recommendedAction: String(item.recommended_action),
          recommendationReason: String(item.recommendation_reason ?? ""),
          recommendationConfidence: Number(item.recommendation_confidence ?? 0),
          candidateTargets: Array.isArray(item.candidate_targets) ? item.candidate_targets : [],
          confidenceLabel:
            Number(item.recommendation_confidence ?? 0) >= 0.85
              ? "HIGH"
              : Number(item.recommendation_confidence ?? 0) >= 0.6
                ? "MEDIUM"
                : "LOW",
          requiresManualReview: Number(item.recommendation_confidence ?? 0) < 0.85,
          blockedAutoApply: Number(item.recommendation_confidence ?? 0) < 0.85,
        }
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
      recommendation_explanation: deriveRecommendationExplanation(recommendation as any),
      decision_transparency: {
        confidence_score: Number((recommendation as any).recommendationConfidence ?? 0),
        reasoning: String((recommendation as any).recommendationReason ?? ""),
        candidates: Array.isArray((recommendation as any).candidateTargets) ? (recommendation as any).candidateTargets : [],
        raw_data: asRecord(item.raw_payload),
        normalized_data: asRecord(item.normalized_payload),
      },
    };
  });

  const unresolved = items.filter((item: any) => item.status === "pending" || item.status === "failed_materialization");
  const blockers = unresolved.filter((item: any) => Boolean(item.blocking_reason)).length;
  const highRiskActions = items.filter((item: any) => Boolean(item.materialized_record?.high_risk_action)).length;

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
        unresolved.map((item: any) => item.id),
      )
      .is("recommendation_seen_at", null);
  }

  return NextResponse.json({
    ok: true,
    items,
    guidance: {
      is_operational_ready: blockers === 0 && integrityErrors.length === 0,
      operational_blockers_count: blockers,
      non_blocking_issues_count: Math.max(0, unresolved.length - blockers),
      high_risk_actions_count: highRiskActions,
      integrity_errors: integrityErrors,
    },
  });
}
