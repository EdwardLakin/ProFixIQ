import { redirect } from "next/navigation";

import FleetDriversWorkspace from "@/features/fleet/components/FleetDriversWorkspace";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { getFleetPortalActorContext } from "../_lib/requireFleetPortalActor";

export default async function FleetDriversPage() {
  const actor = await getFleetPortalActorContext();
  const uiContext = getFleetUiContext(actor);
  if (!uiContext.capabilities.canManageUnits) redirect("/portal/fleet");

  return <FleetDriversWorkspace actorLabel={uiContext.actorLabel} />;
}
