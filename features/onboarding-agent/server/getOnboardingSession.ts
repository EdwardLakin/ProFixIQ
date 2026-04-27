import type { SupabaseClient } from "@supabase/supabase-js";
import { buildOnboardingSummary, ENTITY_BUCKETS, LINK_BUCKETS } from "@/features/onboarding-agent/lib/summaries";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";

export async function getOnboardingSession(params: { supabase: SupabaseClient; shopId: string; sessionId: string }) {
  const sb = params.supabase as any;
  await assertOnboardingSessionOwnership({
    supabase: params.supabase,
    shopId: params.shopId,
    sessionId: params.sessionId,
  });

  const [{ data: session }, { data: files }, { data: entities }, { data: links }, { data: reviews }, { data: latestPlan }] = await Promise.all([
    sb.from("onboarding_sessions").select("*").eq("shop_id", params.shopId).eq("id", params.sessionId).maybeSingle(),
    sb.from("onboarding_files").select("*").eq("shop_id", params.shopId).eq("session_id", params.sessionId).order("created_at", { ascending: false }),
    sb.from("onboarding_entities").select("entity_type").eq("shop_id", params.shopId).eq("session_id", params.sessionId),
    sb.from("onboarding_entity_links").select("link_type, status").eq("shop_id", params.shopId).eq("session_id", params.sessionId),
    sb
      .from("onboarding_review_items")
      .select("id, severity, status, domain, summary, issue_type, details")
      .eq("shop_id", params.shopId)
      .eq("session_id", params.sessionId)
      .order("created_at", { ascending: false }),
    sb.from("onboarding_activation_plans").select("id, status, summary, created_at").eq("shop_id", params.shopId).eq("session_id", params.sessionId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const rowsParsedFromFiles = (files ?? []).reduce((sum: number, file: any) => sum + Number(file.row_count ?? 0), 0);
  const canonical = buildOnboardingSummary({
    filesCount: (files ?? []).length,
    rowsParsed: rowsParsedFromFiles,
    entityRows: (entities ?? []).map((row: any) => ({ entity_type: row.entity_type })),
    linkRows: (links ?? []).map((row: any) => ({ link_type: row.link_type })),
    reviewRows: (reviews ?? []).map((row: any) => ({
      id: row.id,
      severity: row.severity,
      status: row.status,
      domain: row.domain,
      issue_type: row.issue_type,
      summary: row.summary,
      details: row.details ?? {},
    })),
    groupedExceptionCount: (reviews ?? []).length,
    activationReadiness: ((session?.stats ?? {}) as Record<string, unknown>).activation_readiness as string | undefined,
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

  return {
    session,
    files: files ?? [],
    entityCounts,
    reviewCounts,
    reviewItems: reviews ?? [],
    linkCounts,
    latestPlan,
    summaryCounts: {
      uploadedFiles: canonical.files_count,
      rowsParsed: canonical.rows_parsed,
      entitiesDiscovered: canonical.total_entities,
      linksFound: canonical.total_links,
      reviewExceptions: canonical.total_review_items,
      groupedExceptionCount: canonical.grouped_exception_count,
      liveRecordsCreated: 0 as const,
    },
  };
}
