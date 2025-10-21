"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
type DB = Database;

export async function createPurchaseOrder(input: {
  shop_id: string;
  supplier_id?: string | null;
  notes?: string | null;
}) {
  const supabase = createServerActionClient<DB>({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
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

/** Receive all remaining qty for lines (simple MVP).
 *  For a granular UI, create a separate receivePoLine().
 */
export async function receivePo(po_id: string) {
  const supabase = createServerActionClient<DB>({ cookies });

  // Load PO + lines
  const { data: lines, error: le } = await supabase
    .from("purchase_order_lines")
    .select("id, part_id, qty, received_qty, location_id, purchase_orders!inner(shop_id)")
    .eq("po_id", po_id);
  if (le) throw le;

  // Apply stock moves (receive delta)
  for (const ln of lines ?? []) {
    const delta = Number(ln.qty) - Number(ln.received_qty || 0);
    if (delta > 0) {
      // location required: if missing, you can default to MAIN in your UI
      const loc = ln.location_id;
      if (!loc) continue;

      const { error: se } = await supabase.rpc("apply_stock_move", {
        p_part: ln.part_id,           // can be null if only SKU/desc; you may want to require part_id
        p_loc: loc,
        p_qty: delta,
        p_reason: "receive",
        p_ref_kind: "purchase_order",
        p_ref_id: po_id,
      });
      if (se) throw se;

      // Update received tally
      const { error: ue } = await supabase
        .from("purchase_order_lines")
        .update({ received_qty: Number(ln.received_qty || 0) + delta })
        .eq("id", ln.id);
      if (ue) throw ue;
    }
  }

  // Mark PO received
  const { error: pe } = await supabase
    .from("purchase_orders")
    .update({ status: "received" })
    .eq("id", po_id);
  if (pe) throw pe;

  revalidatePath("/parts/po");
}