import { redirect } from "next/navigation";

import FleetReportsWorkspace from "@/features/fleet/components/FleetReportsWorkspace";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { canManageFleetForActor } from "@/features/fleet/lib/resolveFleetActorContext";
import { getFleetPortalActorContext } from "../_lib/requireFleetPortalActor";

type Props = { searchParams: Promise<{ fleetId?: string }> };

export default async function FleetReportsPage({ searchParams }: Props) {
  const { fleetId: requestedFleetId } = await searchParams;
  const actor = await getFleetPortalActorContext(requestedFleetId ?? null);
  const uiContext = getFleetUiContext(actor);
  if (!uiContext.capabilities.canManageUnits) redirect("/portal/fleet");
  const fleetId = actor.isInternal
    ? actor.primaryFleetId
    : requestedFleetId && canManageFleetForActor(actor, requestedFleetId)
      ? requestedFleetId
      : actor.fleetIds.find((id) => canManageFleetForActor(actor, id));
  if (!fleetId) redirect("/portal/fleet");

  return (
    <FleetReportsWorkspace
      actorLabel={uiContext.actorLabel}
      fleetId={fleetId}
    />
  );
}
