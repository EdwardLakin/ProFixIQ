// features/work-orders/lib/work-orders/getQueuedJobsForTech.ts
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type JobLine = Database["public"]["Tables"]["work_order_lines"]["Row"];

/**
 * Fetch queue for a tech as raw DB rows (JobLine[]).
 * - Filters to visible queue statuses
 * - If techId provided: include jobs assigned to that tech OR unassigned
 * - Ordered by parent work order priority first, then oldest → newest
 */
export async function getQueuedJobsForTech(techId?: string): Promise<JobLine[]> {
  const supabase = createClientComponentClient<Database>();

  // join work_orders so we can sort by work order priority
  let query = supabase
    .from("work_order_lines")
    .select(
      `
        *,
        work_orders!inner (
          id,
          priority
        )
      `
    )
    .in("status", ["queued", "awaiting", "in_progress", "on_hold"])
    // highest priority WOs first (1 = highest)
    .order("work_orders(priority)", { ascending: true, nullsFirst: false })
    // then oldest job within that
    .order("created_at", { ascending: true });

  if (techId) {
    // show jobs assigned to this tech OR unassigned
    query = query.or(`assigned_tech_id.eq.${techId},assigned_tech_id.is.null`);
  }

  const { data, error } = await query;
  if (error || !data) {
    console.error("getQueuedJobsForTech error:", error?.message);
    return [];
  }

  // we only declared JobLine, so just return the line shape — the extra joined
  // work_orders data will be ignored by the caller
  return data as JobLine[];
}