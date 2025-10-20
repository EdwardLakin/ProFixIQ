"use server";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
type DB = Database;

export async function listParts(shopId: string) {
  const supabase = createServerComponentClient<DB>({ cookies });
  const { data, error } = await supabase
    .from("parts")
    .select("id, sku, name, category, default_price, low_stock_threshold")
    .eq("shop_id", shopId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getPart(id: string) {
  const supabase = createServerComponentClient<DB>({ cookies });
  const { data, error } = await supabase
    .from("parts")
    .select("*, part_suppliers(*), v_part_stock(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}
