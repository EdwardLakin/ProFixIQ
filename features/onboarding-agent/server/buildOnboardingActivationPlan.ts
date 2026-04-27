import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDryRunActivationPlan } from "@/features/onboarding-agent/lib/activationPlan";

export async function buildOnboardingActivationPlan(params: { supabase: SupabaseClient; shopId: string; sessionId: string }) {
  const sb = params.supabase as any;

  const [{ data: entityRows }, { data: linkRows }, { data: reviewRows }] = await Promise.all([
    sb.from("onboarding_entities").select("entity_type").eq("shop_id", params.shopId).eq("session_id", params.sessionId),
    sb.from("onboarding_entity_links").select("link_type").eq("shop_id", params.shopId).eq("session_id", params.sessionId),
    sb.from("onboarding_review_items").select("severity").eq("shop_id", params.shopId).eq("session_id", params.sessionId).eq("status", "pending"),
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

  const { data } = await sb
    .from("onboarding_activation_plans")
    .insert({ shop_id: params.shopId, session_id: params.sessionId, status: "ready", plan, summary: plan, risk_flags: { risks: plan.risks } })
    .select("id, status, summary, created_at")
    .single();

  return { plan, record: data };
}
