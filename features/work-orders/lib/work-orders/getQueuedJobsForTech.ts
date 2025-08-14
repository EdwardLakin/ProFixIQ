// features/work-orders/lib/work-orders/getQueuedJobsForTech.ts
import { createBrowserSupabase } from "@shared/lib/supabase/client";
import type { QueueJob } from "@work-orders/components/workorders/queueTypes";

/**
 * Returns queue jobs for a tech (assigned to them OR unassigned).
 * Normalizes to your QueueJob shape:
 *  - vehicles is ALWAYS an object with nullable fields (never null/undefined)
 *  - assigned_to is string | {id, full_name} | null
 */
export async function getQueuedJobsForTech(opts?: { techId?: string }): Promise<QueueJob[]> {
  const supabase = createBrowserSupabase();
  const techId = opts?.techId ?? null;

  let query = supabase
    .from("work_order_lines")
    .select("*")
    .in("status", ["queued", "awaiting", "in_progress", "on_hold"])
    .order("created_at", { ascending: true });

  if (techId) {
    // show jobs for this tech OR unassigned
    query = query.or(`assigned_to.eq.${techId},assigned_to.is.null`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as any[];

  return rows.map((j) => {
    const v = j.vehicles as
      | { year: number | null; make: string | null; model: string | null }
      | null
      | undefined;

    // ✅ Non-null object for QueueJob.vehicles
    const vehicles: QueueJob["vehicles"] = {
      year: v?.year ?? null,
      make: v?.make ?? null,
      model: v?.model ?? null,
    };

    const a = j.assigned_to;
    const assigned_to: QueueJob["assigned_to"] =
      a == null
        ? null
        : typeof a === "string"
          ? a
          : { id: (a as any).id as string, full_name: ((a as any).full_name as string) ?? null };

    const job : QueueJob = {
      id: j.id,
      work_order_id: j.work_order_id,
      complaint: j.complaint ?? null,
      status: j.status,
      created_at: j.created_at,
      updated_at: j.updated_at,
      hold_reason: j.hold_reason ?? null,
      punched_in_at: j.punched_in_at ?? null,
      punched_out_at: j.punched_out_at ?? null,
      vehicles,
      assigned_to,
    };

    return job;
  });
}