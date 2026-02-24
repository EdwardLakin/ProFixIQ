// /features/parts/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type StockMoveRow = DB["public"]["Tables"]["stock_moves"]["Row"];

/** Keep this in sync with your Postgres enum public.stock_move_reason */
export type StockMoveReason =
  | "receive"
  | "adjust"
  | "consume"
  | "sale"
  | "waste"
  | "return_in"
  | "return_out";

function extractStockMoveId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const maybe = data as Partial<StockMoveRow>;
  return typeof maybe.id === "string" && maybe.id.length > 0 ? maybe.id : null;
}

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
 *
 * SQL:
 *   apply_stock_move(p_part uuid, p_loc uuid, p_qty numeric, p_reason text, p_ref_kind text, p_ref_id uuid)
 *   RETURNS stock_moves
 */
export async function adjustStock(input: {
  part_id: string;
  location_id: string;
  qty_change: number;
  reason: StockMoveReason;
  reference_kind?: string | null;
  reference_id?: string | null; // UUID or null
}) {
  const supabase = createServerActionClient<DB>({ cookies });

  // Build args using a Record to allow nulls for uuid/text fields safely
  const rpcArgs: Record<string, unknown> = {
    p_part: input.part_id,
    p_loc: input.location_id,
    p_qty: input.qty_change,
    p_reason: input.reason,
    p_ref_kind: input.reference_kind ?? null,
    p_ref_id: input.reference_id ?? null,
  };

  const { data, error } = await supabase.rpc(
    "apply_stock_move",
    rpcArgs as DB["public"]["Functions"]["apply_stock_move"]["Args"],
  );

  if (error) throw error;

  const moveId = extractStockMoveId(data);
  if (!moveId) {
    throw new Error("apply_stock_move returned no id");
  }

  revalidatePath(`/parts/${input.part_id}`);
  return moveId;
}