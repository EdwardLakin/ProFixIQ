import { redirect } from "next/navigation";
import FleetUnitDetailWorkspace from "@/features/fleet/components/FleetUnitDetailWorkspace";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { getFleetPortalActorContext } from "../../_lib/requireFleetPortalActor";

type Props = {
  params: Promise<{ unitId: string }>;
  searchParams: Promise<{ fleetId?: string }>;
};

export default async function PortalFleetUnitDetailPage({
  params,
  searchParams,
}: Props) {
  const [{ unitId }, { fleetId }] = await Promise.all([params, searchParams]);
  const actor = await getFleetPortalActorContext(fleetId ?? null);
  const uiContext = getFleetUiContext(actor);
  if (!uiContext.capabilities.canViewUnitMaintenanceRecord) {
    redirect("/portal/fleet/units");
  }
  const selectedFleetId =
    fleetId && fleetId === actor.primaryFleetId
      ? fleetId
      : actor.primaryFleetId;

  return (
    <FleetUnitDetailWorkspace
      unitId={unitId}
      fleetId={selectedFleetId}
      uiContext={uiContext}
      routePrefix="/portal/fleet"
    />
  );
}
