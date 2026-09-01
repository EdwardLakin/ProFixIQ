import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import {
  resolveFleetActorContext,
  type FleetActorContext,
} from "@/features/fleet/lib/resolveFleetActorContext";
import {
  getFleetShellContext,
  getFleetUiContext,
  type FleetShellContext,
  type FleetUiContext,
} from "@/features/fleet/lib/fleetUiCapabilities";

/**
 * React cache is request-scoped here. It deduplicates the layout + page actor
 * lookup without carrying role or entitlement state across requests.
 */
export const getFleetPortalActorContext = cache(
  async (
    requestedFleetId: string | null = null,
  ): Promise<FleetActorContext & { userId: string }> => {
    const supabase = createServerSupabaseRSC();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/portal/auth/sign-in?redirect=%2Fportal%2Ffleet");
    }

    const actor = await resolveFleetActorContext(supabase, {
      userId: user.id,
      requestedFleetId,
    });
    if (!actor.capabilities.canAccessPortalFleetWrappers) {
      redirect("/portal");
    }

    return { ...actor, userId: user.id };
  },
);

export async function requireFleetPortalActor(
  requestedFleetId: string | null = null,
): Promise<
  FleetUiContext & {
    userId: string;
    primaryFleetId: string | null;
    fleetShellContexts: Record<string, FleetShellContext>;
  }
> {
  const actor = await getFleetPortalActorContext(requestedFleetId);

  return {
    ...getFleetUiContext(actor),
    userId: actor.userId,
    primaryFleetId: actor.primaryFleetId,
    fleetShellContexts: Object.fromEntries(
      actor.fleetMemberships.map((membership) => [
        membership.fleetId,
        getFleetShellContext(actor, membership.fleetId),
      ]),
    ),
  };
}
