import type { SupabaseClient } from "@supabase/supabase-js";
import { buildOnboardingSummary, ENTITY_BUCKETS, LINK_BUCKETS } from "@/features/onboarding-agent/lib/summaries";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";
import {
  countOnboardingEntities,
  countOnboardingEntityLinks,
  countOnboardingPendingReviewItems,
  countOnboardingRawRows,
  fetchPaginatedOnboardingRows,
} from "@/features/onboarding-agent/server/rawRowCounts";

export async function getOnboardingSession(params: { supabase: SupabaseClient; shopId: string; sessionId: string }) {
  const sb = params.supabase as any;
  await assertOnboardingSessionOwnership({
    supabase: params.supabase,
    shopId: params.shopId,
    sessionId: params.sessionId,
  });

  const latestPlanPromise = sb
    .from("onboarding_activation_plans")
    .select("id, status, summary, created_at")
    .eq("shop_id", params.shopId)
    .eq("session_id", params.sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
    .then(({ data, error }: { data: any; error: any }) => {
      if (error) {
        console.warn("[onboarding-agent][session:get] activation plan lookup skipped", {
          shopId: params.shopId,
          sessionId: params.sessionId,
          message: error.message,
        });
        return null;
      }
      return data ?? null;
    });

  const [{ data: session }, { data: files }, entities, links, reviews, latestPlan, rowsParsedTotal, totalEntitiesCount, totalLinksCount, totalPendingReviewCount] = await Promise.all([
    sb.from("onboarding_sessions").select("*").eq("shop_id", params.shopId).eq("id", params.sessionId).maybeSingle(),
    sb.from("onboarding_files").select("*").eq("shop_id", params.shopId).eq("session_id", params.sessionId).order("created_at", { ascending: false }),
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
      select: "id, severity, status, domain, summary, issue_type, details",
      shopId: params.shopId,
      sessionId: params.sessionId,
      orderBy: "created_at",
      ascending: false,
    }),
    latestPlanPromise,
    countOnboardingRawRows({ supabase: params.supabase, shopId: params.shopId, sessionId: params.sessionId }),
    countOnboardingEntities({ supabase: params.supabase, shopId: params.shopId, sessionId: params.sessionId }),
    countOnboardingEntityLinks({ supabase: params.supabase, shopId: params.shopId, sessionId: params.sessionId }),
    countOnboardingPendingReviewItems({ supabase: params.supabase, shopId: params.shopId, sessionId: params.sessionId }),
  ]);
  const canonical = buildOnboardingSummary({
    filesCount: (files ?? []).length,
    rowsParsed: rowsParsedTotal,
    entityRows: entities.map((row: any) => ({ entity_type: row.entity_type, status: row.status })),
    linkRows: links.map((row: any) => ({ link_type: row.link_type, status: row.status })),
    reviewRows: reviews.map((row: any) => ({
      id: row.id,
      severity: row.severity,
      status: row.status,
      domain: row.domain,
      issue_type: row.issue_type,
      summary: row.summary,
      details: row.details ?? {},
    })),
    groupedExceptionCount: totalPendingReviewCount,
    analysisCompleted: Boolean(session?.analyzed_at),
  });

  const entityCounts = ENTITY_BUCKETS.reduce<Record<string, number>>((acc, key) => {
    acc[key] = canonical.entity_counts_by_type[key] ?? 0;
    return acc;
  }, {});
  const linkCounts = LINK_BUCKETS.reduce<Record<string, number>>((acc, key) => {
    acc[key] = canonical.link_counts_by_type[key] ?? 0;
    return acc;
  }, {});

  const reviewCounts = {
    blocking: canonical.review_counts_by_severity.blocking ?? 0,
    high: canonical.review_counts_by_severity.high ?? 0,
    medium: canonical.review_counts_by_severity.medium ?? 0,
    low: canonical.review_counts_by_severity.low ?? 0,
    byDomain: canonical.review_counts_by_domain,
  };

  const canonicalSummary = {
    ...canonical.summaryCounts,
    effectiveFileMappings: Array.isArray((session?.summary ?? {})?.effectiveFileMappings) ? (session?.summary ?? {}).effectiveFileMappings : [],
    filePipelineTraces: Array.isArray((session?.summary ?? {})?.filePipelineTraces) ? (session?.summary ?? {}).filePipelineTraces : [],
    aiRowsSampled: Number((session?.summary ?? {})?.aiRowsSampled ?? canonical.summaryCounts.aiRowsSampled ?? 0),
    aiFilesSampled: Number((session?.summary ?? {})?.aiFilesSampled ?? canonical.summaryCounts.aiFilesSampled ?? 0),
    entitiesDiscovered: totalEntitiesCount,
    linksFound: totalLinksCount,
    reviewExceptions: totalPendingReviewCount,
    activationReadiness: canonical.activation_readiness,
    activationPlanSummary: canonical.activation_plan_summary,
    liveRecordsCreated: 0 as const,
    agentReport: (session?.summary ?? {})?.agentReport ?? null,
    agentPlan: (session?.summary ?? {})?.agentPlan ?? null,
  };

  return {
    session: session ? { ...session, summary: canonicalSummary, stats: canonical } : null,
    files: files ?? [],
    entityCounts,
    entityStatusCounts: canonical.entity_status_counts_by_type,
    reviewCounts,
    reviewItems: reviews,
    linkCounts,
    activationPlanSummary: canonical.activation_plan_summary,
    readiness: canonical.activation_readiness,
    latestPlan,
    summaryCounts: canonical.summaryCounts,
  };
}
