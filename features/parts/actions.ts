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
  reference_kind?: string;
  reference_id?: string;
}) {
  const supabase = createServerActionClient<DB>({ cookies });
  const { data, error } = await supabase.rpc("apply_stock_move", {
    p_part: input.part_id,
    p_loc: input.location_id,
    p_qty: input.qty_change,
    p_reason: input.reason,
    p_ref_kind: input.reference_kind ?? null,
    p_ref_id: input.reference_id ?? null,
  });
  if (error) throw error;
  revalidatePath(`/parts/${input.part_id}`);
  return data as string;
}
