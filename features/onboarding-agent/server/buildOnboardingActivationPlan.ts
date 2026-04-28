import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDryRunActivationPlan } from "@/features/onboarding-agent/lib/activationPlan";
import { buildOnboardingSummary } from "@/features/onboarding-agent/lib/summaries";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";
import {
  countOnboardingEntities,
  countOnboardingEntityLinks,
  countOnboardingPendingReviewItems,
  fetchPaginatedOnboardingRows,
} from "@/features/onboarding-agent/server/rawRowCounts";

export async function buildOnboardingActivationPlan(params: { supabase: SupabaseClient; shopId: string; sessionId: string }) {
  const sb = params.supabase as any;
  await assertOnboardingSessionOwnership({
    supabase: params.supabase,
    shopId: params.shopId,
    sessionId: params.sessionId,
  });

  const [entityRows, linkRows, reviewRows, { data: filesRows }, { data: sessionRow }, totalEntitiesCount, totalLinksCount, totalPendingReviewCount] = await Promise.all([
    fetchPaginatedOnboardingRows<{ entity_type: string; status?: string | null }>({
      supabase: params.supabase,
      table: "onboarding_entities",
      select: "entity_type, status",
      shopId: params.shopId,
      sessionId: params.sessionId,
      orderBy: "id",
      ascending: true,
    }),
    fetchPaginatedOnboardingRows<{ link_type: string; status?: string | null }>({
      supabase: params.supabase,
      table: "onboarding_entity_links",
      select: "link_type, status",
      shopId: params.shopId,
      sessionId: params.sessionId,
      orderBy: "id",
      ascending: true,
    }),
    fetchPaginatedOnboardingRows<any>({
      supabase: params.supabase,
      table: "onboarding_review_items",
      select: "severity, status, domain, issue_type, summary, details",
      shopId: params.shopId,
      sessionId: params.sessionId,
      orderBy: "id",
      ascending: true,
    }),
    sb.from("onboarding_files").select("row_count").eq("shop_id", params.shopId).eq("session_id", params.sessionId),
    sb.from("onboarding_sessions").select("summary, analyzed_at").eq("shop_id", params.shopId).eq("id", params.sessionId).maybeSingle(),
    countOnboardingEntities({ supabase: params.supabase, shopId: params.shopId, sessionId: params.sessionId }),
    countOnboardingEntityLinks({ supabase: params.supabase, shopId: params.shopId, sessionId: params.sessionId }),
    countOnboardingPendingReviewItems({ supabase: params.supabase, shopId: params.shopId, sessionId: params.sessionId }),
  ]);

  const filesCount = (filesRows ?? []).length;
  const rowsParsed = (filesRows ?? []).reduce((sum: number, row: any) => sum + Number(row.row_count ?? 0), 0);

  const canonical = buildOnboardingSummary({
    filesCount,
    rowsParsed,
    entityRows: entityRows.map((row: any) => ({ entity_type: row.entity_type, status: row.status })),
    linkRows: linkRows.map((row: any) => ({ link_type: row.link_type, status: row.status })),
    reviewRows: reviewRows.map((row: any) => ({
      severity: row.severity,
      status: row.status,
      domain: row.domain,
      issue_type: row.issue_type,
      summary: row.summary ?? "",
      details: row.details ?? {},
    })),
    groupedExceptionCount: totalPendingReviewCount,
    analysisCompleted: Boolean(sessionRow?.analyzed_at),
  });

  const plan = buildDryRunActivationPlan({
    sessionId: params.sessionId,
    entityStatusCountsByType: canonical.entity_status_counts_by_type,
    linkRows: linkRows.map((row: any) => ({ link_type: row.link_type, status: row.status })),
    reviewCountsBySeverity: canonical.review_counts_by_severity,
  });

  const sessionSummary = (sessionRow?.summary ?? {}) as Record<string, unknown>;
  const summaryWithAgent = {
    ...plan,
    readiness: canonical.activation_readiness,
    entitiesDiscovered: totalEntitiesCount,
    linksFound: totalLinksCount,
    reviewExceptions: totalPendingReviewCount,
    agentReport: sessionSummary.agentReport ?? null,
    liveRecordsCreated: 0,
  };

  const { data } = await sb
    .from("onboarding_activation_plans")
    .insert({
      shop_id: params.shopId,
      session_id: params.sessionId,
      status: canonical.activation_readiness === "ready_for_dry_run" ? "ready" : "review_required",
      plan,
      summary: summaryWithAgent,
      risk_flags: { risks: plan.risks },
    })
    .select("id, status, summary, created_at")
    .single();

  await sb
    .from("onboarding_sessions")
    .update({
      summary: {
        ...(sessionSummary ?? {}),
        activationPlanSummary: plan,
        activationReadiness: canonical.activation_readiness,
        liveRecordsCreated: 0,
      },
      stats: canonical,
    })
    .eq("shop_id", params.shopId)
    .eq("id", params.sessionId);

  return { plan: summaryWithAgent, record: data };
}
