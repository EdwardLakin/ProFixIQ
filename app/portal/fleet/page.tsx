import FleetControlTower from "@/features/fleet/components/FleetControlTower";
import FleetDispatcherDashboard from "@/features/fleet/components/FleetDispatcherDashboard";
import FleetDriverDashboard from "@/features/fleet/components/FleetDriverDashboard";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { getFleetPortalActorContext } from "./_lib/requireFleetPortalActor";

export default async function PortalFleetPage() {
  const actor = await getFleetPortalActorContext();
  const uiContext = getFleetUiContext(actor);

  if (actor.actorType === "fleet_driver") {
    return <FleetDriverDashboard />;
  }

  if (actor.actorType === "fleet_dispatcher") {
    return (
      <FleetDispatcherDashboard
        fleetId={actor.primaryFleetId}
        actorLabel={uiContext.actorLabel}
      />
    );
  }

  return (
    <FleetControlTower
      shopName="ProFixIQ Fleet"
      shopId={actor.shopId}
      fleetId={actor.primaryFleetId}
      uiContext={uiContext}
      routePrefix="/portal/fleet"
    />
  );
}
