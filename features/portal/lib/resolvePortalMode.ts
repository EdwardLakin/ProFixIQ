import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

export type PortalMode = "customer" | "fleet";

export async function resolvePortalMode(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PortalMode> {
  try {
    const { data: cust } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (cust?.id) return "customer";
  } catch {
    // ignore and continue to fleet check
  }

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, shop_id")
      .eq("id", userId)
      .limit(1)
      .maybeSingle();

    const role = (profile?.role ?? null) as string | null;
    const isFleetRole =
      role === "driver" || role === "dispatcher" || role === "fleet_manager";

    if (profile?.id && isFleetRole && profile.shop_id) return "fleet";
  } catch {
    // ignore and fall back to customer mode
  }

  return "customer";
}
