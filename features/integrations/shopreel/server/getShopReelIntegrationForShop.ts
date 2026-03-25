import type { ShopReelIntegrationRow } from "../types";
import { createAdminClient } from "./createAdminClient";

export async function getShopReelIntegrationForShop(
  shopId: string
): Promise<ShopReelIntegrationRow | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("shopreel_integrations")
    .select("*")
    .eq("shop_id", shopId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as ShopReelIntegrationRow | null) ?? null;
}
