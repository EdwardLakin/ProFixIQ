"use server";

import { cookies } from "next/headers";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { consumePart } from "@/features/work-orders/lib/parts/consumePart";

type DB = Database;

type AllocateResult = {
  ok: true;
  allocated: number;
  skipped: number;
  reasons: string[];
};

export type AllocateMenuItemPartsInput = {
  menu_item_id: string;
  work_order_line_id: string;
};

function asPositiveNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function asFiniteNumberOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function allocateMenuItemParts(
  input: AllocateMenuItemPartsInput,
): Promise<AllocateResult> {
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

  // ✅ 1.5) CRITICAL: set shop context for this server-request session
  // If any RLS policies depend on current_shop_id, this is required.
  const { error: ctxErr } = await supabase.rpc("set_current_shop_id", {
    p_shop_id: shopId,
  });
  if (ctxErr) {
    // Don’t hard-fail the whole job; but record it so we can see it in UI toasts/logs.
    // (If RLS requires it, the next query will return 0 anyway.)
  }

  // 2) Read menu_item_parts for this menu item in this shop
  const { data: parts, error: mpErr } = await supabase
    .from("menu_item_parts")
    .select("id, part_id, quantity, unit_cost, shop_id, name")
    .eq("menu_item_id", input.menu_item_id)
    .eq("shop_id", shopId);

  if (mpErr) throw mpErr;

  const rows = (parts ?? []) as Array<{
    id: string;
    part_id: string | null;
    quantity: number | null;
    unit_cost: number | null;
    shop_id: string | null;
    name: string | null;
  }>;

  const reasons: string[] = [];

  if (!rows.length) {
    if (ctxErr) reasons.push(`shop context rpc failed: ${ctxErr.message}`);
    reasons.push("no menu_item_parts rows visible for this menu_item_id + shop_id");
    return { ok: true, allocated: 0, skipped: 0, reasons };
  }

  let allocated = 0;
  let skipped = 0;

  // 3) Allocate each part via the SAME path as the rest of the app
  for (const p of rows) {
    const partId = typeof p.part_id === "string" && p.part_id.length ? p.part_id : null;
    if (!partId) {
      skipped += 1;
      reasons.push(`skipped: missing part_id for menu_item_part=${p.id} (${p.name ?? "unnamed"})`);
      continue;
    }

    const qty = asPositiveNumber(p.quantity);
    if (!qty) {
      skipped += 1;
      reasons.push(`skipped: invalid quantity for menu_item_part=${p.id} (${p.name ?? "unnamed"})`);
      continue;
    }

    const unitCost = asFiniteNumberOrNull(p.unit_cost);

    try {
      await consumePart({
        work_order_line_id: input.work_order_line_id,
        part_id: partId,
        qty,
        unit_cost: unitCost,
      });
      allocated += 1;
    } catch (e: unknown) {
      skipped += 1;
      const msg = e instanceof Error ? e.message : "unknown error";
      reasons.push(`failed consumePart for part_id=${partId}: ${msg}`);
    }
  }

  if (ctxErr) reasons.push(`shop context rpc failed: ${ctxErr.message}`);

  return { ok: true, allocated, skipped, reasons };
}