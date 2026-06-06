import { redirect } from "next/navigation";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import {
  getFleetUiContext,
  type FleetUiContext,
} from "@/features/fleet/lib/fleetUiCapabilities";


export async function requireFleetPortalActor(): Promise<FleetUiContext> {
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

  return getFleetUiContext(actor);
}
