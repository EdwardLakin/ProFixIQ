// features/portal/lib/resolvePortalMode.ts
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export type PortalMode = "customer" | "fleet";

/**
 * Decide which portal surface the signed-in user should see.
 *
 * Rules (simple + reliable):
 * - If user has a customers row → "customer"
 * - Else if user is a fleet role in profiles (driver/dispatcher/fleet_manager) AND has shop_id → "fleet"
 * - Else default → "customer"
 */
export async function resolvePortalMode(
  supabase: {
    from: <T extends keyof DB["public"]["Tables"]>(
      table: T,
    ) => any;
  },
  userId: string,
): Promise<PortalMode> {
  // 1) Customer portal users
  try {
    const { data: cust } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (cust?.id) return "customer";
  } catch {
    // ignore
  }

  // 2) Fleet portal users
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
    // ignore
  }

  // 3) Safe default
  return "customer";
}