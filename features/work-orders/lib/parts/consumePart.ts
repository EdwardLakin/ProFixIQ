"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { ensureMainLocation } from "@parts/lib/locations";

type DB = Database;

export type ConsumePartInput = {
  work_order_line_id: string;
  part_id: string;
  qty: number; // positive number means "consume qty"
  location_id?: string; // optional; defaults to MAIN for the WO's shop
  unit_cost?: number | null; // optional override from UI
  availability?: string | null; // accepted but not stored yet
};

export async function consumePart(input: ConsumePartInput) {
  const supabase = createServerActionClient<DB>({ cookies });

  if (!input.qty || input.qty <= 0) {
    throw new Error("Quantity must be greater than 0");
  }

  // 1) Look up WO + shop_id from the line (single source of truth)
  const { data: woLine, error: wlErr } = await supabase
    .from("work_order_lines")
    .select("id, work_order_id, work_orders!inner(id, shop_id)")
    .eq("id", input.work_order_line_id)
    .single();

  if (wlErr) throw wlErr;

  const workOrderId = woLine.work_order_id as string;

  // Supabase typed join object can be awkward; keep it safe without `any`
  const joined = woLine as unknown as {
    work_orders: { shop_id: string };
  };
  const shopId = joined.work_orders.shop_id;

  // 2) Determine location_id (default MAIN)
  let locationId = input.location_id;
  if (!locationId) {
    const loc = await ensureMainLocation(shopId);
    locationId = loc.id as string;
  }

  // 3) Determine effective unit_cost:
  //    - prefer explicit value from picker
  //    - otherwise fall back to parts.default_cost
  let effectiveUnitCost: number | null = null;

  if (typeof input.unit_cost === "number" && Number.isFinite(input.unit_cost)) {
    effectiveUnitCost = input.unit_cost;
  } else {
    const { data: part, error: partErr } = await supabase
      .from("parts")
      .select("default_cost")
      .eq("id", input.part_id)
      .single();

    if (partErr) throw partErr;

    const dc = part?.default_cost;
    effectiveUnitCost =
      dc !== null && dc !== undefined && Number.isFinite(Number(dc))
        ? Number(dc)
        : null;
  }

  // 4) Create allocation row FIRST (and include work_order_id for schemas that require it)
  const { data: alloc, error: aErr } = await supabase
    .from("work_order_part_allocations")
    .insert({
      work_order_id: workOrderId,
      work_order_line_id: input.work_order_line_id,
      part_id: input.part_id,
      location_id: locationId,
      qty: Math.abs(input.qty),
      unit_cost: effectiveUnitCost,
    })
    .select("id")
    .single();

  if (aErr) throw aErr;

  // 5) Create stock move (consume = negative)
  const { data: moveId, error: mErr } = await supabase.rpc("apply_stock_move", {
    p_part: input.part_id,
    p_loc: locationId,
    p_qty: -Math.abs(input.qty),
    p_reason: "consume",
    p_ref_kind: "work_order",
    p_ref_id: workOrderId,
  });

  if (mErr) throw mErr;

  // 6) Link stock move back to allocation
  const { error: linkErr } = await supabase
    .from("work_order_part_allocations")
    .update({ stock_move_id: moveId as string })
    .eq("id", alloc.id);

  if (linkErr) throw linkErr;

  // 7) Revalidate the WO page
  revalidatePath(`/work-orders/${workOrderId}`);

  return { allocationId: alloc.id as string, moveId: moveId as string };
}
