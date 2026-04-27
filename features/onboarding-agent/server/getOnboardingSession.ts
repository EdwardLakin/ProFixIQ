import type { SupabaseClient } from "@supabase/supabase-js";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";

const ENTITY_BUCKETS = [
  "customer",
  "vehicle",
  "historical_work_order",
  "historical_invoice",
  "part",
  "vendor",
  "staff_candidate",
  "menu_suggestion",
  "inspection_suggestion",
  "unknown",
] as const;

const LINK_BUCKETS = ["customer_vehicle", "customer_work_order", "vehicle_work_order", "work_order_invoice", "vendor_part"] as const;

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

  const entityCounts = ENTITY_BUCKETS.reduce<Record<string, number>>((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
  for (const row of entities ?? []) {
    entityCounts[row.entity_type] = (entityCounts[row.entity_type] ?? 0) + 1;
  }

  const reviewCounts = {
    blocking: 0,
    high: 0,
    medium: 0,
    low: 0,
    byDomain: {} as Record<string, number>,
  };
  for (const row of reviews ?? []) {
    if (row.status !== "pending") continue;
    if (row.severity === "blocking") reviewCounts.blocking += 1;
    if (row.severity === "high") reviewCounts.high += 1;
    if (row.severity === "medium") reviewCounts.medium += 1;
    if (row.severity === "low") reviewCounts.low += 1;
    const domain = row.domain ?? "unknown";
    reviewCounts.byDomain[domain] = (reviewCounts.byDomain[domain] ?? 0) + 1;
  }

  const linkCounts = LINK_BUCKETS.reduce<Record<string, number>>((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
  for (const row of links ?? []) {
    linkCounts[row.link_type] = (linkCounts[row.link_type] ?? 0) + 1;
  }

  const uploadedFiles = (files ?? []).length;
  const rowsParsedFromFiles = (files ?? []).reduce((sum: number, file: any) => sum + Number(file.row_count ?? 0), 0);
  const entitiesDiscovered = Object.values(entityCounts).reduce((sum, count) => sum + count, 0);
  const linksFound = Object.values(linkCounts).reduce((sum, count) => sum + count, 0);
  const reviewExceptions = reviewCounts.blocking + reviewCounts.high + reviewCounts.medium + reviewCounts.low;

  return {
    session,
    files: files ?? [],
    entityCounts,
    reviewCounts,
    reviewItems: reviews ?? [],
    linkCounts,
    latestPlan,
    summaryCounts: {
      uploadedFiles,
      rowsParsed: rowsParsedFromFiles,
      entitiesDiscovered,
      linksFound,
      reviewExceptions,
      liveRecordsCreated: 0 as const,
    },
  };
}
