import { redirect } from "next/navigation";

import FleetReportsWorkspace from "@/features/fleet/components/FleetReportsWorkspace";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";

export default async function FleetReportsPage() {
  const supabase = createServerSupabaseRSC();
  const actor = await resolveFleetActorContext(supabase);
  const uiContext = getFleetUiContext(actor);
  if (uiContext.experience === "external_driver") redirect("/portal/fleet");

  return <FleetReportsWorkspace actorLabel={uiContext.actorLabel} />;
}
