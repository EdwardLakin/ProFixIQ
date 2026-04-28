import type { SupabaseClient } from "@supabase/supabase-js";

const ONBOARDING_PAGE_SIZE = 1000;

async function countOnboardingTableRows(params: {
  supabase: SupabaseClient;
  table: string;
  shopId: string;
  sessionId: string;
  orFilter?: string;
}): Promise<number> {
  const sb = params.supabase as any;
  let query = sb
    .from(params.table)
    .select("id", { head: true, count: "exact" })
    .eq("shop_id", params.shopId)
    .eq("session_id", params.sessionId);

  if (params.orFilter) query = query.or(params.orFilter);

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return Number(count ?? 0);
}

export async function countOnboardingRawRows(params: {
  supabase: SupabaseClient;
  shopId: string;
  sessionId: string;
}): Promise<number> {
  return countOnboardingTableRows({
    supabase: params.supabase,
    table: "onboarding_raw_rows",
    shopId: params.shopId,
    sessionId: params.sessionId,
  });
}

export async function countOnboardingEntities(params: { supabase: SupabaseClient; shopId: string; sessionId: string }): Promise<number> {
  return countOnboardingTableRows({
    supabase: params.supabase,
    table: "onboarding_entities",
    shopId: params.shopId,
    sessionId: params.sessionId,
  });
}

export async function countOnboardingEntityLinks(params: { supabase: SupabaseClient; shopId: string; sessionId: string }): Promise<number> {
  return countOnboardingTableRows({
    supabase: params.supabase,
    table: "onboarding_entity_links",
    shopId: params.shopId,
    sessionId: params.sessionId,
  });
}

export async function countOnboardingPendingReviewItems(params: { supabase: SupabaseClient; shopId: string; sessionId: string }): Promise<number> {
  return countOnboardingTableRows({
    supabase: params.supabase,
    table: "onboarding_review_items",
    shopId: params.shopId,
    sessionId: params.sessionId,
    orFilter: "status.is.null,status.eq.pending",
  });
}

export async function fetchPaginatedOnboardingRows<T>(params: {
  supabase: SupabaseClient;
  table: string;
  select: string;
  shopId: string;
  sessionId: string;
  orderBy?: string;
  ascending?: boolean;
  orFilter?: string;
}): Promise<T[]> {
  const sb = params.supabase as any;
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + ONBOARDING_PAGE_SIZE - 1;
    let query = sb
      .from(params.table)
      .select(params.select)
      .eq("shop_id", params.shopId)
      .eq("session_id", params.sessionId);

    if (params.orFilter) query = query.or(params.orFilter);
    if (params.orderBy) query = query.order(params.orderBy, { ascending: params.ascending ?? true });
    query = query.range(from, to);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < ONBOARDING_PAGE_SIZE) break;
    from += ONBOARDING_PAGE_SIZE;
  }

  return rows;
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
