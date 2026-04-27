import type { SupabaseClient } from "@supabase/supabase-js";

export async function countOnboardingRawRows(params: {
  supabase: SupabaseClient;
  shopId: string;
  sessionId: string;
}): Promise<number> {
  const sb = params.supabase as any;
  const { count, error } = await sb
    .from("onboarding_raw_rows")
    .select("id", { head: true, count: "exact" })
    .eq("shop_id", params.shopId)
    .eq("session_id", params.sessionId);

  if (error) throw new Error(error.message);
  return Number(count ?? 0);
}

export async function countOnboardingRawRowsBySession(params: {
  supabase: SupabaseClient;
  shopId: string;
  sessionIds: string[];
}): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const uniqueSessionIds = Array.from(new Set(params.sessionIds.filter(Boolean)));
  await Promise.all(uniqueSessionIds.map(async (sessionId) => {
    const count = await countOnboardingRawRows({
      supabase: params.supabase,
      shopId: params.shopId,
      sessionId,
    });
    counts.set(sessionId, count);
  }));
  return counts;
}
