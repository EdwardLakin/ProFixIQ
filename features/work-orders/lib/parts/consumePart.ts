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
  availability?: string | null; // accepted but not stored yet (option A)
};

export async function consumePart(input: ConsumePartInput) {
  const supabase = createServerActionClient<DB>({ cookies });

  if (!input.qty || input.qty <= 0) {
    throw new Error("Quantity must be greater than 0");
  }

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

  // 3) Determine effective unit_cost:
  //    - prefer the explicit value from the picker
  //    - otherwise fall back to parts.default_cost (old behaviour)
  let effectiveUnitCost: number | null = null;

  if (
    typeof input.unit_cost === "number" &&
    !Number.isNaN(input.unit_cost)
  ) {
    effectiveUnitCost = input.unit_cost;
  } else {
    const { data: part, error: partErr } = await supabase
      .from("parts")
      .select("default_cost")
      .eq("id", input.part_id)
      .single();
    if (partErr) throw partErr;

    if (
      part?.default_cost !== null &&
      part?.default_cost !== undefined &&
      !Number.isNaN(Number(part.default_cost))
    ) {
      effectiveUnitCost = Number(part.default_cost);
    } else {
      effectiveUnitCost = null;
    }
  }

  // 4) Create allocation row (without stock_move_id yet)
  const { data: alloc, error: aErr } = await supabase
    .from("work_order_part_allocations")
    .insert({
      work_order_line_id: input.work_order_line_id,
      part_id: input.part_id,
      location_id: locationId!,
      qty: Math.abs(input.qty),
      unit_cost: effectiveUnitCost,
      // if you later add an "availability" column, wire:
      // availability: input.availability ?? null,
    })
    .select("id")
    .single();
  if (aErr) throw aErr;

  // 5) Create stock move (consume = negative)
  const { data: moveId, error: mErr } = await supabase.rpc(
    "apply_stock_move",
    {
      p_part: input.part_id,
      p_loc: locationId!,
      p_qty: -Math.abs(input.qty),
      p_reason: "consume",
      p_ref_kind: "WO",
      p_ref_id: workOrderId,
    },
  );
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