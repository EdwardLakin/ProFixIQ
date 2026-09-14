import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

const SHOP_PAGE_SIZE = 500;

/**
 * Page through every shop id in creation order. A single fixed-size,
 * oldest-first page would permanently exclude every shop past the page size
 * once the shop count grows beyond it — the same page would be selected on
 * every run. Cursoring on created_at instead means a growing shop count
 * degrades run time, not coverage.
 *
 * created_at alone is not a unique key — shops inserted in the same batch
 * can share a timestamp — so a strict `created_at > cursor` predicate would
 * skip every remaining shop at that boundary once one page ends mid-tie.
 * Cursor on the (created_at, id) pair instead: id is unique, so ties are
 * broken deterministically and no shop is ever skipped.
 */
export async function fetchAllShopIds(
  supabase: SupabaseClient<Database>,
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: { createdAt: string; id: string } | null = null;

  for (;;) {
    let query = supabase
      .from("shops")
      .select("id, created_at")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(SHOP_PAGE_SIZE);

    if (cursor) {
      query = query.or(
        `created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`,
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    ids.push(...rows.map((row) => row.id));
    if (rows.length < SHOP_PAGE_SIZE) break;
    const last = rows[rows.length - 1];
    if (!last?.created_at || !last.id) break;
    cursor = { createdAt: last.created_at, id: last.id };
  }

  return ids;
}
