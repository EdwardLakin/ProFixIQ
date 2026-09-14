import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

const SHOP_PAGE_SIZE = 500;

/**
 * Page through every shop id in creation order. A single fixed-size,
 * oldest-first page would permanently exclude every shop past the page size
 * once the shop count grows beyond it — the same page would be selected on
 * every run. Cursoring on created_at instead means a growing shop count
 * degrades run time, not coverage. Shared by every internal cron route that
 * needs to sweep all shops (shop-blocker observations, appointment
 * preparations, ...).
 */
export async function fetchAllShopIds(
  supabase: SupabaseClient<Database>,
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;

  for (;;) {
    let query = supabase
      .from("shops")
      .select("id, created_at")
      .order("created_at", { ascending: true })
      .limit(SHOP_PAGE_SIZE);

    if (cursor) {
      query = query.gt("created_at", cursor);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    ids.push(...rows.map((row) => row.id));
    if (rows.length < SHOP_PAGE_SIZE) break;
    cursor = rows[rows.length - 1]?.created_at ?? null;
    if (!cursor) break;
  }

  return ids;
}
