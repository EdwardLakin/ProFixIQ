"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
type DB = Database;

export async function createPart(input: {
  shop_id: string;
  sku?: string;
  name: string;
  description?: string;
  default_cost?: number;
  default_price?: number;
  category?: string;
  subcategory?: string;
  low_stock_threshold?: number;
}) {
  const supabase = createServerActionClient<DB>({ cookies });
  const { data, error } = await supabase
    .from("parts")
    .insert(input)
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/parts");
  return data.id as string;
}

export async function adjustStock(input: {
  part_id: string;
  location_id: string;
  qty_change: number;
  reason: "receive" | "adjust" | "return";
  reference_kind?: string | null; // caller may give null, we’ll convert to undefined
  reference_id?: string | null;
}) {
  const supabase = createServerActionClient<DB>({ cookies });

  const { data, error } = await supabase.rpc("apply_stock_move", {
    p_part: input.part_id,
    p_loc: input.location_id,
    p_qty: input.qty_change,
    p_reason: input.reason,
    // IMPORTANT: pass undefined (not null) for optional RPC params
    p_ref_kind: input.reference_kind ?? undefined,
    p_ref_id: input.reference_id ?? undefined,
  });

  if (error) throw error;

  // apply_stock_move RETURNS TABLE(id uuid) → TS sees `{ id: string }[]`
  const id =
    Array.isArray(data) ? (data[0]?.id as string | undefined) : (data as unknown as { id?: string })?.id;
  revalidatePath(`/parts/${input.part_id}`);
  return id ?? "";
}
