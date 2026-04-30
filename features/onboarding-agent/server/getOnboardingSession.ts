import type { SupabaseClient } from "@supabase/supabase-js";
import { buildOnboardingSummary, ENTITY_BUCKETS, LINK_BUCKETS } from "@/features/onboarding-agent/lib/summaries";
import type { Database } from "@/features/shared/types/types/supabase";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";
import {
  countOnboardingEntities,
  countOnboardingEntityLinks,
  countOnboardingPendingReviewItems,
  countOnboardingRawRows,
} from "@/features/onboarding-agent/server/rawRowCounts";

type AdminSupabase = SupabaseClient<Database>;

type JsonObject = Record<string, unknown>;

type ReviewSeverity = "low" | "medium" | "high" | "blocking";

type ReviewSampleRow = {
  id: string;
  severity: ReviewSeverity | null;
  status: string | null;
  domain: string | null;
  issue_type: string | null;
  summary: string | null;
  created_at: string | null;
};

type PostgrestResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type SessionFetchRow = {
  id: string;
  shop_id: string;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  analyzed_at: string | null;
  summary: unknown;
};

type FileFetchRow = {
  id: string;
  shop_id: string;
  session_id: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  status: string | null;
  row_count: number | null;
  created_at: string | null;
  updated_at: string | null;
};

function toReviewSeverity(value: string | null): ReviewSeverity {
  return value === "low" || value === "medium" || value === "high" || value === "blocking" ? value : "medium";
}

function asJsonObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

export async function getOnboardingSession(params: { supabase: AdminSupabase; shopId: string; sessionId: string }) {
  const sb = params.supabase;
  const sessionTimingsMs: Record<string, number> = {};
  const sessionRowCounts: Record<string, number> = {};
  const startedAt = Date.now();
  let currentStage = "session:ownership";

  const stage = async <T>(name: string, run: () => PromiseLike<T>) => {
    currentStage = name;
    const started = Date.now();
    const result = await run();
    sessionTimingsMs[name] = Date.now() - started;
    return result;
  };

  const safeErrorLog = (error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown session load error";
    console.error("[onboarding-agent][session:get] stage failed", {
      shopId: params.shopId,
      sessionId: params.sessionId,
      stage: currentStage,
      elapsedMs: Date.now() - startedAt,
      rowCountsAttempted: sessionRowCounts,
      message,
    });
  };

  const countByField = async (table: string, field: string, value: string, orFilter?: string) => {
    let query = sb.from(table).select("id", { head: true, count: "exact" }).eq("shop_id", params.shopId).eq("session_id", params.sessionId).eq(field, value);
    if (orFilter) query = query.or(orFilter);
    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return Number(count ?? 0);
  };

  try {
    await stage("session:ownership", () => assertOnboardingSessionOwnership({
      supabase: params.supabase,
      shopId: params.shopId,
      sessionId: params.sessionId,
    }));

  const latestPlanPromise = sb
    .from("onboarding_activation_plans")
    .select("id, status, summary, created_at")
    .eq("shop_id", params.shopId)
    .eq("session_id", params.sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
    .then(({ data, error }) => {
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

  const [sessionResult, filesResult, reviewSampleResult, latestPlan, rowsParsedTotal, totalEntitiesCount, totalLinksCount, totalPendingReviewCount] = await Promise.all([
    stage("session:fetch", () => sb.from("onboarding_sessions").select("id,shop_id,status,created_at,updated_at,analyzed_at,summary").eq("shop_id", params.shopId).eq("id", params.sessionId).maybeSingle()),
    stage("files:fetch", () => sb.from("onboarding_files").select("id,shop_id,session_id,file_name,file_type,file_size,status,row_count,created_at,updated_at").eq("shop_id", params.shopId).eq("session_id", params.sessionId).order("created_at", { ascending: false })),
    stage("reviews:samples", () => sb.from("onboarding_review_items").select("id,severity,status,domain,summary,issue_type,created_at").eq("shop_id", params.shopId).eq("session_id", params.sessionId).or("status.is.null,status.eq.pending").order("created_at", { ascending: false }).range(0, 249)),
    stage("activation:latest-plan", async () => latestPlanPromise),
    stage("rows:raw-count", async () => countOnboardingRawRows({ supabase: params.supabase, shopId: params.shopId, sessionId: params.sessionId })),
    stage("entities:total-count", async () => countOnboardingEntities({ supabase: params.supabase, shopId: params.shopId, sessionId: params.sessionId })),
    stage("links:total-count", async () => countOnboardingEntityLinks({ supabase: params.supabase, shopId: params.shopId, sessionId: params.sessionId })),
    stage("reviews:pending-count", async () => countOnboardingPendingReviewItems({ supabase: params.supabase, shopId: params.shopId, sessionId: params.sessionId })),
  ]);
  const typedSessionResult = sessionResult as PostgrestResult<SessionFetchRow>;
  const typedFilesResult = filesResult as PostgrestResult<FileFetchRow[]>;
  const typedReviewSampleResult = reviewSampleResult as PostgrestResult<ReviewSampleRow[]>;

  if (typedSessionResult.error) throw new Error(typedSessionResult.error.message);
  if (typedFilesResult.error) throw new Error(typedFilesResult.error.message);
  if (typedReviewSampleResult.error) throw new Error(typedReviewSampleResult.error.message);

  const session = typedSessionResult.data ?? null;
  const files = typedFilesResult.data ?? [];
  const reviewSample: ReviewSampleRow[] = typedReviewSampleResult.data ?? [];
  sessionRowCounts.files = (files ?? []).length;
  sessionRowCounts.reviewSamples = (reviewSample ?? []).length;
  sessionRowCounts.entities = totalEntitiesCount;
  sessionRowCounts.links = totalLinksCount;
  sessionRowCounts.pendingReviews = totalPendingReviewCount;

  const [entityStatusCounts, linkTypeCounts, reviewSeverityCounts, reviewDomainCounts] = await Promise.all([
    stage("entities:status-counts", async () => {
      const counts: Record<string, Record<string, number>> = {};
      await Promise.all(ENTITY_BUCKETS.map(async (type) => {
        counts[type] = {};
        for (const status of ["ready", "matched", "activated", "needs_review", "duplicate_candidate", "rejected", "ignored"]) {
          const { count, error } = await sb
            .from("onboarding_entities")
            .select("id", { head: true, count: "exact" })
            .eq("shop_id", params.shopId)
            .eq("session_id", params.sessionId)
            .eq("entity_type", type)
            .eq("status", status);
          if (error) throw new Error(error.message);
          counts[type][status] = Number(count ?? 0);
        }
      }));
      return counts;
    }),
    stage("links:type-counts", async () => {
      const counts: Record<string, number> = {};
      await Promise.all(LINK_BUCKETS.map(async (type) => {
        counts[type] = await countByField("onboarding_entity_links", "link_type", type);
      }));
      return counts;
    }),
    stage("reviews:severity-counts", async () => {
      const sev: Record<string, number> = {};
      for (const s of ["blocking", "high", "medium", "low"]) {
        sev[s] = await countByField("onboarding_review_items", "severity", s, "status.is.null,status.eq.pending");
      }
      return sev;
    }),
    stage("reviews:domain-counts", async () => {
      const domains = Array.from(new Set((reviewSample ?? []).map((r) => String(r.domain ?? "unknown"))));
      const out: Record<string, number> = {};
      await Promise.all(domains.map(async (d: string) => {
        out[d] = d === "unknown"
          ? await sb.from("onboarding_review_items").select("id", { head: true, count: "exact" }).eq("shop_id", params.shopId).eq("session_id", params.sessionId).or("status.is.null,status.eq.pending").is("domain", null).then(({ count, error }) => { if (error) throw new Error(error.message); return Number(count ?? 0); })
          : await countByField("onboarding_review_items", "domain", d, "status.is.null,status.eq.pending");
      }));
      return out;
    }),
  ]);
  const canonical = buildOnboardingSummary({
    filesCount: (files ?? []).length,
    rowsParsed: rowsParsedTotal,
    entityRows: [],
    linkRows: [],
    reviewRows: (reviewSample ?? []).map((row) => ({
      id: row.id,
      severity: toReviewSeverity(row.severity),
      status: row.status,
      domain: row.domain,
      issue_type: row.issue_type,
      summary: row.summary ?? "Onboarding review item needs attention.",
      details: {},
    })),
    groupedExceptionCount: totalPendingReviewCount,
    analysisCompleted: Boolean(session?.analyzed_at),
  });

  const entityCounts = ENTITY_BUCKETS.reduce<Record<string, number>>((acc, key) => {
    const statusCounts = entityStatusCounts[key] ?? {};
    acc[key] = Object.values(statusCounts).reduce((sum, count) => sum + Number(count ?? 0), 0);
    return acc;
  }, {});
  const linkCounts = LINK_BUCKETS.reduce<Record<string, number>>((acc, key) => {
    acc[key] = linkTypeCounts[key] ?? 0;
    return acc;
  }, {});

  const reviewCounts = { ...reviewSeverityCounts, byDomain: reviewDomainCounts };
  const sessionSummary = asJsonObject(session?.summary);

  const canonicalSummary = {
    ...canonical.summaryCounts,
    effectiveFileMappings: Array.isArray(sessionSummary.effectiveFileMappings) ? sessionSummary.effectiveFileMappings : [],
    filePipelineTraces: Array.isArray(sessionSummary.filePipelineTraces) ? sessionSummary.filePipelineTraces : [],
    aiRowsSampled: Number(sessionSummary.aiRowsSampled ?? canonical.summaryCounts.aiRowsSampled ?? 0),
    aiFilesSampled: Number(sessionSummary.aiFilesSampled ?? canonical.summaryCounts.aiFilesSampled ?? 0),
    entitiesDiscovered: totalEntitiesCount,
    linksFound: totalLinksCount,
    reviewExceptions: totalPendingReviewCount,
    activationReadiness: canonical.activation_readiness,
    activationPlanSummary: canonical.activation_plan_summary,
    liveRecordsCreated: Number(sessionSummary.liveRecordsCreated ?? 0),
    agentReport: sessionSummary.agentReport ?? null,
    agentPlan: sessionSummary.agentPlan ?? null,
    activationProgress: sessionSummary.activationProgress ?? null,
    onboardingActivation: sessionSummary.onboardingActivation ?? null,
    completion: sessionSummary.completion ?? null,
    assistantHandoff: sessionSummary.assistantHandoff ?? null,
  };

  return {
    session: session ? { ...session, summary: canonicalSummary, stats: canonical } : null,
    files: files ?? [],
    entityCounts,
    entityStatusCounts: entityStatusCounts,
    reviewCounts,
    reviewItems: (reviewSample ?? []).slice(0, 250),
    linkCounts,
    activationPlanSummary: canonical.activation_plan_summary,
    readiness: canonical.activation_readiness,
    latestPlan,
    summaryCounts: {
      ...canonical.summaryCounts,
      entitiesDiscovered: totalEntitiesCount,
      linksFound: totalLinksCount,
      reviewExceptions: totalPendingReviewCount,
    },
    diagnostics: {
      sessionTimingsMs,
      sessionRowCounts,
    },
  };
  } catch (error) {
    safeErrorLog(error);
    throw error;
  }
}
