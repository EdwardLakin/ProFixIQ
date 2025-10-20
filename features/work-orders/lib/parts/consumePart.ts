"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { ensureMainLocation } from "@parts/lib/locations";

type DB = Database;

export async function consumePart(input: {
  work_order_line_id: string;
  part_id: string;
  qty: number;                 // positive number means "consume qty"
  location_id?: string;        // optional; defaults to MAIN for the WO's shop
}) {
  const supabase = createServerActionClient<DB>({ cookies });

  // 1) Look up WO + shop_id from the line
  const { data: woLine, error: wlErr } = await supabase
    .from("work_order_lines")
    .select("id, work_order_id, work_orders!inner(id, shop_id)")
    .eq("id", input.work_order_line_id)
    .single();
  if (wlErr) throw wlErr;

  const workOrderId = woLine.work_order_id;
  const shopId = (woLine as any).work_orders.shop_id as string;

  // 2) Determine location_id
  let locationId = input.location_id;
  if (!locationId) {
    const loc = await ensureMainLocation(shopId);
    locationId = loc.id;
  }

  // 3) (Optional) get a unit cost from part default for audit
  const { data: part, error: partErr } = await supabase
    .from("parts")
    .select("default_cost")
    .eq("id", input.part_id)
    .single();
  if (partErr) throw partErr;
  const unit_cost = Number(part?.default_cost ?? 0);

  // 4) Create allocation row (without stock_move_id yet)
  const { data: alloc, error: aErr } = await supabase
    .from("work_order_part_allocations")
    .insert({
      work_order_line_id: input.work_order_line_id,
      part_id: input.part_id,
      location_id: locationId!,
      qty: Math.abs(input.qty),
      unit_cost,
    })
    .select("id")
    .single();
  if (aErr) throw aErr;

  // 5) Create stock move (consume = negative)
  const { data: moveId, error: mErr } = await supabase.rpc("apply_stock_move", {
    p_part: input.part_id,
    p_loc: locationId!,
    p_qty: -Math.abs(input.qty),
    p_reason: "consume",
    p_ref_kind: "WO",
    p_ref_id: workOrderId,
  });
  if (mErr) throw mErr;

  // 6) Link stock move back to allocation
  const { error: linkErr } = await supabase
    .from("work_order_part_allocations")
    .update({ stock_move_id: moveId as string })
    .eq("id", alloc.id);
  if (linkErr) throw linkErr;

  // 7) Revalidate WO page if your route matches /work-orders/[id]
  revalidatePath(`/work-orders/${workOrderId}`);

  return { allocationId: alloc.id as string, moveId: moveId as string };
}
