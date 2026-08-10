import { redirect } from "next/navigation";

import FleetDriversWorkspace from "@/features/fleet/components/FleetDriversWorkspace";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";

export default async function FleetDriversPage() {
  const supabase = createServerSupabaseRSC();
  const actor = await resolveFleetActorContext(supabase);
  const uiContext = getFleetUiContext(actor);
  if (!uiContext.capabilities.canManageUnits) redirect("/portal/fleet");

  return <FleetDriversWorkspace actorLabel={uiContext.actorLabel} />;
}
