import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDryRunActivationPlan } from "@/features/onboarding-agent/lib/activationPlan";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";

export async function buildOnboardingActivationPlan(params: { supabase: SupabaseClient; shopId: string; sessionId: string }) {
  const sb = params.supabase as any;
  await assertOnboardingSessionOwnership({
    supabase: params.supabase,
    shopId: params.shopId,
    sessionId: params.sessionId,
  });

  const [{ data: entityRows }, { data: linkRows }, { data: reviewRows }, { data: sessionRow }] = await Promise.all([
    sb.from("onboarding_entities").select("entity_type").eq("shop_id", params.shopId).eq("session_id", params.sessionId),
    sb.from("onboarding_entity_links").select("link_type").eq("shop_id", params.shopId).eq("session_id", params.sessionId),
    sb.from("onboarding_review_items").select("severity").eq("shop_id", params.shopId).eq("session_id", params.sessionId).eq("status", "pending"),
    sb.from("onboarding_sessions").select("summary").eq("shop_id", params.shopId).eq("id", params.sessionId).maybeSingle(),
  ]);

  const entityCounts = (entityRows ?? []).reduce((acc: Record<string, number>, row: any) => {
    acc[row.entity_type] = (acc[row.entity_type] ?? 0) + 1;
    return acc;
  }, {});
  const linkCounts = (linkRows ?? []).reduce((acc: Record<string, number>, row: any) => {
    acc[row.link_type] = (acc[row.link_type] ?? 0) + 1;
    return acc;
  }, {});

  const blocking = (reviewRows ?? []).filter((row: any) => row.severity === "blocking").length;
  const nonblocking = (reviewRows ?? []).length - blocking;

  const plan = buildDryRunActivationPlan({
    sessionId: params.sessionId,
    entityCounts,
    linkCounts,
    reviewBlocking: blocking,
    reviewNonBlocking: nonblocking,
  });

  const sessionSummary = (sessionRow?.summary ?? {}) as Record<string, unknown>;
  const summaryWithAgent = { ...plan, agentReport: sessionSummary.agentReport ?? null, liveRecordsCreated: 0 };

  const { data } = await sb
    .from("onboarding_activation_plans")
    .insert({ shop_id: params.shopId, session_id: params.sessionId, status: "ready", plan, summary: summaryWithAgent, risk_flags: { risks: plan.risks } })
    .select("id, status, summary, created_at")
    .single();

  return { plan: summaryWithAgent, record: data };
}
