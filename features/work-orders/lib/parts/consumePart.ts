// features/work-orders/lib/parts/consumePart.ts
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { ensureMainLocation } from "@parts/lib/locations";

type DB = Database;

type StockMoveRow = DB["public"]["Tables"]["stock_moves"]["Row"];

export type ConsumePartInput = {
  work_order_line_id: string;
  part_id: string;
  qty: number; // positive number means "consume qty"
  location_id?: string; // optional; defaults to MAIN for the WO's shop
  unit_cost?: number | null; // optional override from UI
  availability?: string | null; // accepted but not stored yet
};

function extractStockMoveId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const maybe = data as Partial<StockMoveRow>;
  const id = maybe.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

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
  const joined = woLine as unknown as { work_orders: { shop_id: string } };
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

  const qtyAbs = Math.abs(input.qty);

  // 4) Create stock move (consume = negative)
  // NOTE: apply_stock_move RETURNS stock_moves row, not uuid
  const { data: moveRow, error: mErr } = await supabase.rpc("apply_stock_move", {
    p_part: input.part_id,
    p_loc: locationId,
    p_qty: -qtyAbs,
    p_reason: "consume",
    p_ref_kind: "work_order",
    p_ref_id: workOrderId,
  });

  if (mErr) throw mErr;

  const moveId = extractStockMoveId(moveRow);
  if (!moveId) {
    throw new Error("Inventory move failed: apply_stock_move returned no id");
  }

  // 5) Create allocation row (link to move)
  const { data: alloc, error: aErr } = await supabase
    .from("work_order_part_allocations")
    .insert({
      work_order_id: workOrderId,
      work_order_line_id: input.work_order_line_id,
      part_id: input.part_id,
      location_id: locationId,
      qty: qtyAbs,
      unit_cost: effectiveUnitCost,
      stock_move_id: moveId,
    })
    .select("id")
    .single();

  if (aErr) throw aErr;

  // 6) Revalidate the WO page
  revalidatePath(`/work-orders/${workOrderId}`);

  return { allocationId: alloc.id as string, moveId };
}