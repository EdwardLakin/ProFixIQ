"use server";

import { cookies } from "next/headers";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { consumePart } from "@/features/work-orders/lib/parts/consumePart";

type DB = Database;

type MenuItemPartRow = DB["public"]["Tables"]["menu_item_parts"]["Row"];

export type AllocateMenuItemPartsInput = {
  menu_item_id: string;
  work_order_line_id: string;
};

function asPositiveNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return n;
}

export async function allocateMenuItemParts(input: AllocateMenuItemPartsInput) {
  const supabase = createServerActionClient<DB>({ cookies });

  // 1) Load WO + shop_id from the line (single source of truth)
  const { data: woLine, error: wlErr } = await supabase
    .from("work_order_lines")
    .select("id, work_order_id, work_orders!inner(id, shop_id)")
    .eq("id", input.work_order_line_id)
    .single();

  if (wlErr) throw wlErr;

  const joined = woLine as unknown as { work_orders: { shop_id: string } };
  const shopId = joined.work_orders.shop_id;

  // 2) Read menu_item_parts for this menu item in this shop
  const { data: parts, error: mpErr } = await supabase
    .from("menu_item_parts")
    .select("id, part_id, quantity, unit_cost, shop_id, name")
    .eq("menu_item_id", input.menu_item_id)
    .eq("shop_id", shopId);

  if (mpErr) throw mpErr;

  const rows = (parts ?? []) as MenuItemPartRow[];
  if (!rows.length) {
    return { ok: true, allocated: 0, skipped: 0 };
  }

  let allocated = 0;
  let skipped = 0;

  // 3) Allocate each part via the SAME path as the rest of the app
  for (const p of rows) {
    const partId = typeof p.part_id === "string" && p.part_id.length ? p.part_id : null;
    if (!partId) {
      skipped += 1;
      continue;
    }

    const qty = asPositiveNumber((p as unknown as { quantity?: unknown }).quantity);
    if (!qty) {
      skipped += 1;
      continue;
    }

    const unitCost =
      typeof (p as unknown as { unit_cost?: unknown }).unit_cost === "number" &&
      Number.isFinite((p as unknown as { unit_cost: number }).unit_cost)
        ? (p as unknown as { unit_cost: number }).unit_cost
        : null;

    await consumePart({
      work_order_line_id: input.work_order_line_id,
      part_id: partId,
      qty,
      unit_cost: unitCost,
    });

    allocated += 1;
  }

  return { ok: true, allocated, skipped };
}