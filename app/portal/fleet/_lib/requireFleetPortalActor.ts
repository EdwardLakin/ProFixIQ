import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import {
  resolveFleetActorContext,
  type FleetActorContext,
} from "@/features/fleet/lib/resolveFleetActorContext";
import {
  getFleetUiContext,
  type FleetUiContext,
} from "@/features/fleet/lib/fleetUiCapabilities";

/**
 * React cache is request-scoped here. It deduplicates the layout + page actor
 * lookup without carrying role or entitlement state across requests.
 */
export const getFleetPortalActorContext = cache(
  async (): Promise<FleetActorContext & { userId: string }> => {
    const supabase = createServerSupabaseRSC();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/portal/auth/sign-in?redirect=%2Fportal%2Ffleet");
    }

    const actor = await resolveFleetActorContext(supabase, { userId: user.id });
    if (!actor.capabilities.canAccessPortalFleetWrappers) {
      redirect("/portal");
    }

    return { ...actor, userId: user.id };
  },
);

export async function requireFleetPortalActor(): Promise<
  FleetUiContext & { userId: string; primaryFleetId: string | null }
> {
  const actor = await getFleetPortalActorContext();

  return {
    ...getFleetUiContext(actor),
    userId: actor.userId,
    primaryFleetId: actor.primaryFleetId,
  };
}
