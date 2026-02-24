// /features/parts/server/poActions.ts (FULL FILE REPLACEMENT)
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

function pickShopIdFromJoin(v: unknown): string | null {
  // Supabase generated types often model joins as arrays, even for !inner single row.
  if (!v) return null;

  const getShopId = (obj: unknown): string | null => {
    if (!obj || typeof obj !== "object") return null;
    const rec = obj as Record<string, unknown>;
    return typeof rec.shop_id === "string" && rec.shop_id.length > 0
      ? rec.shop_id
      : null;
  };

  if (Array.isArray(v)) {
    return v.length ? getShopId(v[0]) : null;
  }

  return getShopId(v);
}

export async function createPurchaseOrder(input: {
  shop_id: string;
  supplier_id?: string | null;
  notes?: string | null;
}) {
  const supabase = createServerActionClient<DB>({ cookies });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw new Error(userErr.message);
  if (!user) throw new Error("Unauthenticated");

  const { data, error } = await supabase
    .from("purchase_orders")
    .insert({
      shop_id: input.shop_id,
      supplier_id: input.supplier_id ?? null,
      notes: input.notes ?? null,
      created_by: user.id,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) throw error;

  revalidatePath("/parts/po");
  return data.id as string;
}

export async function addPoLine(input: {
  po_id: string;
  part_id?: string | null;
  sku?: string | null;
  description?: string | null;
  qty: number;
  unit_cost?: number | null;
  location_id?: string | null;
}) {
  const supabase = createServerActionClient<DB>({ cookies });

  if (input.qty <= 0) throw new Error("Quantity must be > 0");

  const { error } = await supabase.from("purchase_order_lines").insert({
    po_id: input.po_id,
    part_id: input.part_id ?? null,
    sku: input.sku ?? null,
    description: input.description ?? null,
    qty: input.qty,
    unit_cost: input.unit_cost ?? null,
    location_id: input.location_id ?? null,
  });

  if (error) throw error;

  revalidatePath("/parts/po");
}

export async function markPoSent(po_id: string) {
  const supabase = createServerActionClient<DB>({ cookies });

  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "sent" })
    .eq("id", po_id);

  if (error) throw error;

  revalidatePath("/parts/po");
}

/** Receive all remaining qty for lines (simple MVP). */
export async function receivePo(po_id: string) {
  const supabase = createServerActionClient<DB>({ cookies });

  // Load PO lines + joined shop_id
  const { data: lines, error: le } = await supabase
    .from("purchase_order_lines")
    .select(
      "id, part_id, qty, received_qty, location_id, purchase_orders!inner(shop_id)",
    )
    .eq("po_id", po_id);

  if (le) throw le;

  // Extract shop_id from the join safely (handles array/object typing)
  const first = (lines?.[0] ?? null) as unknown as Record<string, unknown> | null;
  const shopId = pickShopIdFromJoin(first?.purchase_orders);

  if (!shopId) {
    throw new Error("Missing shop_id for PO (purchase_orders join failed)");
  }

  // Set RLS context for server session
  const { error: ctxErr } = await supabase.rpc("set_current_shop_id", {
    p_shop_id: shopId,
  });
  if (ctxErr) throw new Error(ctxErr.message || "Failed to set current_shop_id");

  for (const ln of lines ?? []) {
    const qty = Number((ln as unknown as Record<string, unknown>).qty);
    const received = Number(
      (ln as unknown as Record<string, unknown>).received_qty ?? 0,
    );
    const delta = qty - received;

    if (!Number.isFinite(delta) || delta <= 0) continue;

    const rec = ln as unknown as Record<string, unknown>;
    const loc = typeof rec.location_id === "string" ? rec.location_id : null;
    if (!loc) continue; // MVP: require location to receive

    const partId = typeof rec.part_id === "string" ? rec.part_id : null;
    if (!partId) {
      // MVP rule: receiving requires a real part_id
      const lineId = typeof rec.id === "string" ? rec.id : "(unknown)";
      throw new Error(
        `PO line ${lineId} has no part_id (SKU-only line). Assign a part before receiving.`,
      );
    }

    const { error: se } = await supabase.rpc("apply_stock_move", {
      p_part: partId,
      p_loc: loc,
      p_qty: delta,
      p_reason: "receive",
      p_ref_kind: "purchase_order",
      p_ref_id: po_id,
    });
    if (se) throw se;

    const lineId = typeof rec.id === "string" ? rec.id : null;
    if (!lineId) throw new Error("Missing purchase_order_lines.id");

    const { error: ue } = await supabase
      .from("purchase_order_lines")
      .update({ received_qty: received + delta })
      .eq("id", lineId);

    if (ue) throw ue;
  }

  const { error: pe } = await supabase
    .from("purchase_orders")
    .update({ status: "received" })
    .eq("id", po_id);

  if (pe) throw pe;

  revalidatePath("/parts/po");
}