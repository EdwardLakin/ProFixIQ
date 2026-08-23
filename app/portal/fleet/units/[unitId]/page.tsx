import { redirect } from "next/navigation";
import FleetUnitDetailWorkspace from "@/features/fleet/components/FleetUnitDetailWorkspace";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { getFleetPortalActorContext } from "../../_lib/requireFleetPortalActor";

type Props = { params: Promise<{ unitId: string }> };

export default async function PortalFleetUnitDetailPage({ params }: Props) {
  const { unitId } = await params;
  const actor = await getFleetPortalActorContext();
  const uiContext = getFleetUiContext(actor);
  if (!uiContext.capabilities.canViewUnitMaintenanceRecord) {
    redirect("/portal/fleet/units");
  }

  return (
    <FleetUnitDetailWorkspace
      unitId={unitId}
      fleetId={actor.primaryFleetId}
      uiContext={uiContext}
      routePrefix="/portal/fleet"
    />
  );
}
