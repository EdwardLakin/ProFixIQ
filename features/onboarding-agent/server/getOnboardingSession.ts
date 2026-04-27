import type { SupabaseClient } from "@supabase/supabase-js";

export async function getOnboardingSession(params: { supabase: SupabaseClient; shopId: string; sessionId: string }) {
  const sb = params.supabase as any;

  const [{ data: session }, { data: files }, { data: entities }, { data: links }, { data: reviews }, { data: latestPlan }] = await Promise.all([
    sb.from("onboarding_sessions").select("*").eq("shop_id", params.shopId).eq("id", params.sessionId).maybeSingle(),
    sb.from("onboarding_files").select("*").eq("shop_id", params.shopId).eq("session_id", params.sessionId).order("created_at", { ascending: false }),
    sb.from("onboarding_entities").select("entity_type").eq("shop_id", params.shopId).eq("session_id", params.sessionId),
    sb.from("onboarding_entity_links").select("link_type, status").eq("shop_id", params.shopId).eq("session_id", params.sessionId),
    sb.from("onboarding_review_items").select("id, severity, status, domain, summary, issue_type").eq("shop_id", params.shopId).eq("session_id", params.sessionId).order("created_at", { ascending: false }),
    sb.from("onboarding_activation_plans").select("id, status, summary, created_at").eq("shop_id", params.shopId).eq("session_id", params.sessionId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const entityCounts = (entities ?? []).reduce((acc: Record<string, number>, row: any) => {
    acc[row.entity_type] = (acc[row.entity_type] ?? 0) + 1;
    return acc;
  }, {});

  const reviewCounts = (reviews ?? []).reduce((acc: Record<string, number>, row: any) => {
    const key = row.severity === "blocking" ? "blocking" : "nonblocking";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const linkCounts = (links ?? []).reduce((acc: Record<string, number>, row: any) => {
    acc[row.link_type] = (acc[row.link_type] ?? 0) + 1;
    return acc;
  }, {});

  return {
    session,
    files: files ?? [],
    entityCounts,
    reviewCounts,
    reviewItems: reviews ?? [],
    linkCounts,
    latestPlan,
  };
}
