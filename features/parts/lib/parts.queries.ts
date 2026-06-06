"use server";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";

export async function listParts(shopId: string) {
  const supabase = createServerSupabaseRSC();
  const { data, error } = await supabase
    .from("parts")
    .select("id, sku, name, category, default_price, low_stock_threshold")
    .eq("shop_id", shopId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getPart(id: string) {
  const supabase = createServerSupabaseRSC();
  const { data, error } = await supabase
    .from("parts")
    .select("*, part_suppliers(*), v_part_stock(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}
