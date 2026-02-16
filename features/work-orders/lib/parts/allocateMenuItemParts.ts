// features/work-orders/lib/parts/allocateMenuItemParts.ts
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { consumePart } from "@/features/work-orders/lib/parts/consumePart";
import { ensureMainLocation } from "@parts/lib/locations";

type DB = Database;

type MenuItemPartRow = DB["public"]["Tables"]["menu_item_parts"]["Row"];

export type AllocateMenuItemPartsInput = {
  menu_item_id: string;
  work_order_line_id: string;
};

function asPositiveNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function asFiniteNumberOrUndefined(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function allocateMenuItemParts(input: AllocateMenuItemPartsInput) {
  const supabase = createServerActionClient<DB>({ cookies });

  // 1) Load line (source of truth for shop + work order)
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

  // 3) Read menu_item_parts (shop-scoped)
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

  // 4) Default location fallback is MAIN (consumePart can also resolve best-bin if you omit)
  const mainLoc = await ensureMainLocation(shopId);
  const locationId = typeof mainLoc?.id === "string" ? mainLoc.id : null;
  if (!locationId) throw new Error("Failed to resolve MAIN stock location");

  let allocated = 0;
  let skipped = 0;

  // 5) Allocate each part via consumePart() (creates stock move + allocation)
  for (const p of rows) {
    const partId =
      typeof p.part_id === "string" && p.part_id.length ? p.part_id : null;
    if (!partId) {
      skipped += 1;
      continue;
    }

    const qty = asPositiveNumber(p.quantity);
    if (!qty) {
      skipped += 1;
      continue;
    }

    const unitCost = asFiniteNumberOrUndefined(p.unit_cost);

    await consumePart({
      work_order_line_id: input.work_order_line_id,
      part_id: partId,
      qty,
      location_id: locationId, // satisfies NOT NULL + consistent default
      ...(typeof unitCost === "number" ? { unit_cost: unitCost } : {}),
    });

    allocated += 1;
  }

  revalidatePath(`/work-orders/${workOrderId}`);

  return { ok: true, allocated, skipped };
}