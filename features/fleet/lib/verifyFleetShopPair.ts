import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

/**
 * `resolveSelectedFleetRequestScope`/`resolveFleetActorScope` return a
 * {shopId, fleetId} pair, but for an internal actor the fleetId comes from
 * the request and is only checked against `actor.fleetIds` (which can
 * include a fleet owned by a *different* shop if the same user also holds a
 * fleet_members row there). Confirm the two actually belong to each other
 * before any privileged, shop/fleet-scoped write -- the same check the
 * fleet member-invitations route already performs.
 */
export async function verifyFleetShopPair(
  admin: SupabaseClient<DB>,
  fleetId: string,
  shopId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("fleets")
    .select("id")
    .eq("id", fleetId)
    .eq("shop_id", shopId)
    .maybeSingle();

  return !error && Boolean(data);
}
