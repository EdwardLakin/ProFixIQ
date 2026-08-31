import FleetControlTower from "@/features/fleet/components/FleetControlTower";
import FleetDispatcherDashboard from "@/features/fleet/components/FleetDispatcherDashboard";
import FleetDriverDashboard from "@/features/fleet/components/FleetDriverDashboard";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { getFleetPortalActorContext } from "./_lib/requireFleetPortalActor";

type PortalFleetPageProps = {
  searchParams: Promise<{ fleetId?: string }>;
};

export default async function PortalFleetPage({
  searchParams,
}: PortalFleetPageProps) {
  const actor = await getFleetPortalActorContext();
  const uiContext = getFleetUiContext(actor);
  const { fleetId: requestedFleetId } = await searchParams;

  // An alert carries the fleet it belongs to, because the alert feed spans every
  // fleet this actor manages. Honour it only when the actor holds an entitled
  // membership for it; otherwise fall back to their primary fleet.
  const selectedFleetId =
    requestedFleetId && actor.fleetIds.includes(requestedFleetId)
      ? requestedFleetId
      : actor.primaryFleetId;

  if (actor.actorType === "fleet_driver") {
    return <FleetDriverDashboard />;
  }

  if (actor.actorType === "fleet_dispatcher") {
    return (
      <FleetDispatcherDashboard
        fleetId={selectedFleetId}
        actorLabel={uiContext.actorLabel}
      />
    );
  }

  return (
    <FleetControlTower
      shopName="ProFixIQ Fleet"
      shopId={actor.shopId}
      fleetId={selectedFleetId}
      uiContext={uiContext}
      routePrefix="/portal/fleet"
    />
  );
}
