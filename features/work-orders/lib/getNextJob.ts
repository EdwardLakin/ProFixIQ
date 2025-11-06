 // features/work-orders/lib/getNextJob.ts
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type NextLine = {
  id: string;
  work_order_id: string | null;
  created_at: string;
  status:
    | "ready"
    | "active"
    | "paused"
    | "on_hold"
    | "completed"
    | "queued"
    | "awaiting"
    | "in_progress";
  priority?: number | null;
};

export async function getNextAvailableLine(
  technicianId: string
): Promise<NextLine | null> {
  const supabase = await createServerSupabaseRSC();

  // 0) what shop is this tech in?
  const { data: prof } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", technicianId)
    .single();

  const shopId = prof?.shop_id;
  if (!shopId) {
    // if the tech has no shop, we can't safely scope — bail
    return null;
  }

  // 1) resume this tech's own job first
  {
    const { data: resume } = await supabase
      .from("work_order_lines")
      .select("id, work_order_id, created_at, status, priority")
      .eq("assigned_to", technicianId)
      .in("status", ["in_progress", "paused", "awaiting"])
      .order("priority", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(1);

    if (resume && resume.length > 0) {
      return resume[0] as NextLine;
    }
  }

  // helper that tries to find one queued+unassigned line
  async function tryFindQueued(
    allowNullShop: boolean
  ): Promise<
    | {
        id: string;
        work_order_id: string | null;
        created_at: string;
        status: string;
        priority: number | null;
      }
    | null
  > {
    let query = supabase
      .from("work_order_lines")
      .select(
        `
        id,
        work_order_id,
        created_at,
        status,
        priority,
        work_orders!inner ( id, shop_id )
      `
      )
      .eq("status", "queued")
      .is("assigned_to", null)
      .order("priority", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(1);

    // normal path: only lines whose WO belongs to this shop
    if (!allowNullShop) {
      query = query.eq("work_orders.shop_id", shopId);
    } else {
      // fallback: pick queued/unassigned where the WO has no shop yet
      query = query.is("work_orders.shop_id", null);
    }

    const { data, error } = await query;
    if (error) {
      console.warn("getNextAvailableLine: queued lookup failed:", error.message);
      return null;
    }
    return (data && data[0]) || null;
  }

  // 2) preferred: queued, unassigned, same shop
  let candidate = await tryFindQueued(false);

  // 3) fallback: queued, unassigned, WO has no shop_id yet
  if (!candidate) {
    candidate = await tryFindQueued(true);
  }

  if (!candidate) {
    return null;
  }

  // 4) claim it conditionally (race-safe)
  const { data: claimed, error: claimErr } = await supabase
    .from("work_order_lines")
    .update({ assigned_to: technicianId, status: "awaiting" })
    .eq("id", candidate.id)
    .is("assigned_to", null)
    .select("id, work_order_id, created_at, status, priority")
    .single();

  if (claimErr || !claimed) {
    return null;
  }

  // 5) also reflect in the multi-tech table (best-effort)
  const { error: linkErr } = await supabase
    .from("work_order_line_technicians")
    .upsert(
      [
        {
          work_order_line_id: claimed.id,
          technician_id: technicianId,
        },
      ],
      {
        onConflict: "work_order_line_id,technician_id",
      }
    );

  if (linkErr) {
    // not fatal, we already claimed the line
    console.warn(
      "getNextAvailableLine: failed to upsert line technician:",
      linkErr.message
    );
  }

  return claimed as NextLine;
}