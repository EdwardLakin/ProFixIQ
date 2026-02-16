// features/work-orders/lib/parts/consumePart.ts
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { ensureMainLocation } from "@parts/lib/locations";

type DB = Database;

type StockMoveRow = DB["public"]["Tables"]["stock_moves"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];

export type ConsumePartInput = {
  work_order_line_id: string;
  part_id: string;
  qty: number; // positive number means "consume qty"
  location_id?: string; // optional; defaults to MAIN for the WO's shop
  unit_cost?: number; // optional override from UI (NO nulls)
  availability?: string | null; // accepted but not stored yet
};

function extractStockMoveId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const maybe = data as Partial<StockMoveRow>;
  const id = maybe.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function asFiniteNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Best-bin selection:
 * - If part_stock exists and has location rows, pick the location with max(available)
 * - Otherwise fall back to MAIN location.
 *
 * This is defensive: any schema mismatch falls back silently.
 */
async function resolveBestLocationId(args: {
  supabase: ReturnType<typeof createServerActionClient<DB>>;
  shopId: string;
  partId: string;
}): Promise<string> {
  const { supabase, shopId, partId } = args;

  // MAIN fallback is always safe
  const main = await ensureMainLocation(shopId);
  const mainId = typeof main?.id === "string" && main.id.length ? main.id : null;
  if (!mainId) throw new Error("Failed to resolve MAIN stock location");

  try {
    // Try the common schema: part_stock(shop_id, part_id, location_id, qty_on_hand, qty_reserved)
    const { data, error } = await supabase
      .from("part_stock")
      .select("location_id, qty_on_hand, qty_reserved")
      .eq("shop_id", shopId)
      .eq("part_id", partId);

    if (error) return mainId;
    if (!Array.isArray(data) || data.length === 0) return mainId;

    let bestLoc: string | null = null;
    let bestAvail = -Infinity;

    for (const row of data) {
      const rec = row as Record<string, unknown>;
      const loc = typeof rec.location_id === "string" ? rec.location_id : null;
      if (!loc) continue;

      const onHand = asFiniteNumber(rec.qty_on_hand) ?? 0;
      const reserved = asFiniteNumber(rec.qty_reserved) ?? 0;
      const avail = onHand - reserved;

      if (avail > bestAvail) {
        bestAvail = avail;
        bestLoc = loc;
      }
    }

    return bestLoc ?? mainId;
  } catch {
    return mainId;
  }
}

export async function consumePart(input: ConsumePartInput) {
  const supabase = createServerActionClient<DB>({ cookies });

  if (!input.qty || input.qty <= 0) {
    throw new Error("Quantity must be greater than 0");
  }

  // 1) Look up WO + shop_id from the line (single source of truth)
  const { data: woLine, error: wlErr } = await supabase
    .from("work_order_lines")
    .select("id, work_order_id, shop_id")
    .eq("id", input.work_order_line_id)
    .single();

  if (wlErr) throw wlErr;

  const workOrderId =
    typeof woLine.work_order_id === "string" ? woLine.work_order_id : null;
  const shopId = typeof woLine.shop_id === "string" ? woLine.shop_id : null;

  if (!workOrderId) throw new Error("Missing work_order_id on line");
  if (!shopId) throw new Error("Missing shop_id on line");

  // 2) CRITICAL: set current_shop_id() for THIS server session (RLS)
  const { error: ctxErr } = await supabase.rpc("set_current_shop_id", {
    p_shop_id: shopId,
  });
  if (ctxErr) {
    throw new Error(
      ctxErr.message || "Failed to set server shop context (current_shop_id)",
    );
  }

  // 3) Determine location_id (best-bin -> fallback MAIN)
  const locationId =
    typeof input.location_id === "string" && input.location_id.length
      ? input.location_id
      : await resolveBestLocationId({ supabase, shopId, partId: input.part_id });

  // 4) Determine effective unit_cost:
  //    - prefer explicit value from picker
  //    - otherwise fall back to parts.default_cost
  //    - NEVER pass null (use undefined to omit)
  let effectiveUnitCost: number | undefined;

  if (typeof input.unit_cost === "number" && Number.isFinite(input.unit_cost)) {
    effectiveUnitCost = input.unit_cost;
  } else {
    const { data: part, error: partErr } = await supabase
      .from("parts")
      .select("default_cost")
      .eq("id", input.part_id)
      .single();

    if (partErr) throw partErr;

    const dc = (part as PartRow | null)?.default_cost;
    const n = asFiniteNumber(dc);
    if (typeof n === "number") effectiveUnitCost = n;
  }

  const qtyAbs = Math.abs(input.qty);

  // 5) Create stock move (consume = negative)
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

  // 6) Create allocation row (link to move)
  // CRITICAL: include shop_id to satisfy shop-scoped policies (shop_id = current_shop_id())
  const baseInsert = {
    shop_id: shopId,
    work_order_id: workOrderId,
    work_order_line_id: input.work_order_line_id,
    part_id: input.part_id,
    location_id: locationId,
    qty: qtyAbs,
    stock_move_id: moveId,
  };

  const allocInsert =
    typeof effectiveUnitCost === "number"
      ? { ...baseInsert, unit_cost: effectiveUnitCost }
      : baseInsert;

  const { data: alloc, error: aErr } = await supabase
    .from("work_order_part_allocations")
    .insert(allocInsert)
    .select("id")
    .single();

  if (aErr) throw aErr;

  // 7) Revalidate the WO page
  revalidatePath(`/work-orders/${workOrderId}`);

  const allocationId =
    alloc && typeof alloc.id === "string" ? alloc.id : undefined;

  return { allocationId, moveId };
}