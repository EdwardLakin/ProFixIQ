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

/**
 * Adjust on-hand stock for a part at a location.
 * This matches SQL where `apply_stock_move(...) RETURNS uuid`.
 */
export async function adjustStock(input: {
  part_id: string;
  location_id: string;
  qty_change: number;
  reason:
    | "receive"
    | "adjust"
    | "consume"
    | "sale"
    | "waste"
    | "return_in"
    | "return_out"; // keep in sync with your stock_move_reason enum
  reference_kind?: string | null;
  reference_id?: string | null;
}) {
  const supabase = createServerActionClient<DB>({ cookies });

  const { data, error } = await supabase.rpc("apply_stock_move", {
    p_part: input.part_id,
    p_loc: input.location_id,
    p_qty: input.qty_change,
    // If your generated types are narrower here, the `as any` avoids friction while DB is source of truth.
    p_reason: input.reason as any,
    // IMPORTANT: use undefined for omitted optional params (null is different to Postgres)
    p_ref_kind: input.reference_kind ?? undefined,
    p_ref_id: input.reference_id ?? undefined,
  });

  if (error) throw error;

  // When RETURNS uuid, Supabase client returns a string
  const moveId = typeof data === "string" ? data : (data as unknown as string);

  revalidatePath(`/parts/${input.part_id}`);
  return moveId;
}
