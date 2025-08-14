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

export async function getNextAvailableLine(technicianId: string): Promise<NextLine | null> {
  const supabase = await createServerSupabaseRSC(); // ✅ await

  // Scope to tech's shop
  const { data: prof } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", technicianId)
    .single();

  const shopId = prof?.shop_id;
  if (!shopId) return null;

  // 1) Resume tech's own job if available
  {
    const { data: resume } = await supabase
      .from("work_order_lines")
      .select("id, work_order_id, created_at, status, priority")
      .eq("assigned_to", technicianId)
      .in("status", ["in_progress", "paused", "awaiting"])
      .order("priority", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(1);

    if (resume?.length) return resume[0] as NextLine;
  }

  // 2) Oldest highest-priority unassigned queued job in same shop
  const { data: candidateList, error: candErr } = await supabase
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
    .eq("work_orders.shop_id", shopId)
    .order("priority", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1);

  if (candErr) {
    console.warn("Failed to find next queued job:", candErr.message);
    return null;
  }
  const candidate = candidateList?.[0];
  if (!candidate) return null;

  // 3) Claim it conditionally (race-safe)
  const { data: claimed, error: claimErr } = await supabase
    .from("work_order_lines")
    .update({ assigned_to: technicianId, status: "awaiting" })
    .eq("id", candidate.id)
    .is("assigned_to", null)
    .select("id, work_order_id, created_at, status, priority")
    .single();

  if (claimErr || !claimed) return null;

  return claimed as NextLine;
}