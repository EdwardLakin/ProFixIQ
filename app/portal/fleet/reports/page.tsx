import { redirect } from "next/navigation";

import FleetReportsWorkspace from "@/features/fleet/components/FleetReportsWorkspace";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { canManageFleetForActor } from "@/features/fleet/lib/resolveFleetActorContext";
import { getFleetPortalActorContext } from "../_lib/requireFleetPortalActor";

export default async function FleetReportsPage() {
  const actor = await getFleetPortalActorContext();
  const uiContext = getFleetUiContext(actor);
  if (!uiContext.capabilities.canManageUnits) redirect("/portal/fleet");
  const fleetId = actor.isInternal
    ? actor.primaryFleetId
    : actor.fleetIds.find((id) => canManageFleetForActor(actor, id));
  if (!fleetId) redirect("/portal/fleet");

  return (
    <FleetReportsWorkspace
      actorLabel={uiContext.actorLabel}
      fleetId={fleetId}
    />
  );
}
