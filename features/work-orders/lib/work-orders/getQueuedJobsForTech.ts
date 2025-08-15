import { createBrowserSupabase } from "@shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

// DB row type
type WOL = Database["public"]["Tables"]["work_order_lines"]["Row"];

/** Minimal UI job shape derived from DB
 *  - vehicles: always an object (fields nullable)
 *  - assigned_to: supports string id | joined object | null
 */
export type TechQueueJob = Omit<WOL, "vehicles" | "assigned_to"> & {
  vehicles: { year: number | null; make: string | null; model: string | null };
  assigned_to: string | { id: string; full_name: string | null } | null;
};

export async function getQueuedJobsForTech(opts?: {
  techId?: string | null;
}): Promise<TechQueueJob[]> {
  const supabase = createBrowserSupabase();
  const techId = opts?.techId ?? null;

  let query = supabase
    .from("work_order_lines")
    .select("*")
    .in("status", ["queued", "awaiting", "in_progress", "on_hold"])
    .order("created_at", { ascending: true });

  if (techId) {
    // show lines assigned to this tech OR unassigned
    query = query.or(`assigned_to.eq.${techId},assigned_to.is.null`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as WOL[];

  return rows.map((j) => {
    // normalize vehicles to a non-null object
    const vehicles: TechQueueJob["vehicles"] = {
      year: j.vehicles?.year ?? null,
      make: j.vehicles?.make ?? null,
      model: j.vehicles?.model ?? null,
    };

    // normalize assigned_to to accept string OR joined object OR null
    let assigned_to: TechQueueJob["assigned_to"] = null;
    if (j.assigned_to) {
      if (typeof j.assigned_to === "string") {
        assigned_to = j.assigned_to;
      } else {
        // when a view joins profiles and returns an object
        const a = j.assigned_to as { id?: string | null; full_name?: string | null };
        assigned_to = { id: a.id ?? "", full_name: a.full_name ?? null };
      }
    }

    // keep all other columns from the row
    return {
      ...j,
      vehicles,
      assigned_to,
    };
  });
}