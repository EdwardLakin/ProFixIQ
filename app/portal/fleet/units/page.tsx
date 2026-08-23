import FleetUnitsPage from "@/features/fleet/components/FleetUnitsPage";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { getFleetPortalActorContext } from "../_lib/requireFleetPortalActor";

export default async function PortalFleetUnitsPage() {
  const actor = await getFleetPortalActorContext();

  return (
    <FleetUnitsPage
      uiContext={getFleetUiContext(actor)}
      routePrefix="/portal/fleet"
    />
  );
}
