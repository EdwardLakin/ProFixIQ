import type { SupabaseClient } from "@supabase/supabase-js";

const SUMMARY_RESET = {
  uploadedFiles: 0,
  rowsParsed: 0,
  rowsParsedTotal: 0,
  aiRowsSampled: 0,
  aiFilesSampled: 0,
  entitiesDiscovered: 0,
  linksFound: 0,
  reviewExceptions: 0,
  groupedExceptionCount: 0,
  effectiveFileMappings: [],
  filePipelineTraces: [],
  activationReadiness: "not_ready",
  activationPlanSummary: null,
  agentPlan: null,
  agentReport: null,
  analysisError: null,
  analysisFailedAt: null,
  liveRecordsCreated: 0,
};

export async function resetOnboardingAnalysisArtifacts(params: {
  supabase: SupabaseClient;
  shopId: string;
  sessionId: string;
}) {
  const sb = params.supabase as any;

  const run = async (promise: Promise<{ error?: { message?: string } | null }>) => {
    const { error } = await promise;
    if (error) throw new Error(error.message ?? "Failed onboarding analysis reset step");
  };

  await run(sb.from("onboarding_sessions").update({ status: "clearing_previous_analysis" }).eq("shop_id", params.shopId).eq("id", params.sessionId));

  await run(sb.from("onboarding_entity_links").delete().eq("shop_id", params.shopId).eq("session_id", params.sessionId));
  await run(sb.from("onboarding_review_items").delete().eq("shop_id", params.shopId).eq("session_id", params.sessionId));
  await run(sb.from("onboarding_entities").delete().eq("shop_id", params.shopId).eq("session_id", params.sessionId));
  await run(sb.from("onboarding_activation_plans").delete().eq("shop_id", params.shopId).eq("session_id", params.sessionId));

  const { data: session } = await sb.from("onboarding_sessions").select("summary").eq("shop_id", params.shopId).eq("id", params.sessionId).maybeSingle();
  const existingSummary = (session?.summary && typeof session.summary === "object") ? session.summary : {};

  await run(sb.from("onboarding_sessions").update({
    analyzed_at: null,
    stats: {},
    summary: {
      ...existingSummary,
      ...SUMMARY_RESET,
    },
  }).eq("shop_id", params.shopId).eq("id", params.sessionId));
}
