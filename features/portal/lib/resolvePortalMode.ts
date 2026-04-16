import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";

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
    const actor = await resolveFleetActorContext(supabase, { userId });
    if (actor.capabilities.canAccessPortalFleetWrappers) return "fleet";
  } catch {
    // ignore and fall back to customer mode
  }

  return "customer";
}
