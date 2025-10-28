"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

/** Keep this in sync with your Postgres enum stock_move_reason */
export type StockMoveReason =
  | "receive"
  | "adjust"
  | "consume"
  | "sale"
  | "waste"
  | "return_in"
  | "return_out";

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

/** RPC payload for apply_stock_move */
type ApplyStockMoveArgs = {
  p_part: string;
  p_loc: string;
  p_qty: number;
  p_reason: StockMoveReason | string; // Supabase RPC arg is `string`
  p_ref_kind: string;                 // must be string, not undefined/null
  p_ref_id: string;                   // must be string, not undefined/null
};

/**
 * Adjust on-hand stock for a part at a location.
 * Matches SQL: apply_stock_move(p_part, p_loc, p_qty, p_reason, p_ref_kind, p_ref_id) RETURNS uuid
 */
export async function adjustStock(input: {
  part_id: string;
  location_id: string;
  qty_change: number;
  reason: StockMoveReason;
  reference_kind?: string | null;
  reference_id?: string | null;
}) {
  const supabase = createServerActionClient<DB>({ cookies });

  const rpcArgs: ApplyStockMoveArgs = {
    p_part: input.part_id,
    p_loc: input.location_id,
    p_qty: input.qty_change,
    // The generated type for RPC often expects `string`; our union is compatible.
    p_reason: input.reason,
    // IMPORTANT: RPC arg types are `string`, so pass "" when omitted.
    p_ref_kind: input.reference_kind ?? "",
    p_ref_id: input.reference_id ?? "",
  };

  const { data, error } = await supabase.rpc("apply_stock_move", rpcArgs);
  if (error) throw error;

  // Supabase returns the function result directly; for RETURNS uuid it's a string.
  const moveId =
    typeof data === "string"
      ? data
      : (data as unknown as string); // retain type safety without `any`

  revalidatePath(`/parts/${input.part_id}`);
  return moveId;
}