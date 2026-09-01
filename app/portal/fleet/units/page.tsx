import FleetUnitsPage from "@/features/fleet/components/FleetUnitsPage";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { getFleetPortalActorContext } from "../_lib/requireFleetPortalActor";

type Props = { searchParams: Promise<{ fleetId?: string }> };

export default async function PortalFleetUnitsPage({ searchParams }: Props) {
  const { fleetId } = await searchParams;
  const actor = await getFleetPortalActorContext(fleetId ?? null);

  return (
    <FleetUnitsPage
      uiContext={getFleetUiContext(actor)}
      routePrefix="/portal/fleet"
    />
  );
}
