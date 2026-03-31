import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export async function getShopPricingValidDays(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  fallback?: number;
}): Promise<number> {
  const { supabase, shopId, fallback = 30 } = args;

  const { data, error } = await supabase
    .from("shops")
    .select("menu_repair_pricing_valid_days")
    .eq("id", shopId)
    .maybeSingle();

  if (error) return fallback;

  const raw = data?.menu_repair_pricing_valid_days;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
}
