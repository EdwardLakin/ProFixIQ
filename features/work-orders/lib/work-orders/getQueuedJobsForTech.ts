// features/shared/lib/getQueuedJobsForTech.ts
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type JobLine = Database["public"]["Tables"]["work_order_lines"]["Row"];

/**
 * Fetch queue for a tech as raw DB rows (JobLine[]).
 * - Filters to visible queue statuses
 * - If techId provided: include jobs assigned to that tech OR unassigned
 * - Ordered oldest → newest
 */
export async function getQueuedJobsForTech(techId?: string): Promise<JobLine[]> {
  const supabase = createClientComponentClient<Database>();

  let query = supabase
    .from("work_order_lines")
    .select("*")
    .in("status", ["queued", "awaiting", "in_progress", "on_hold"])
    .order("created_at", { ascending: true });

  if (techId) {
    // show jobs assigned to this tech OR unassigned
    query = query.or(`assigned_to.eq.${techId},assigned_to.is.null`);
  }

  const { data, error } = await query;
  if (error || !data) {
    console.error("getQueuedJobsForTech error:", error?.message);
    return [];
  }

  return data as JobLine[];
}