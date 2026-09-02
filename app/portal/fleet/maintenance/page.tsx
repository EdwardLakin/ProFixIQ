import { redirect } from "next/navigation";

import FleetMaintenanceWorkspace from "@/features/fleet/components/FleetMaintenanceWorkspace";
import { requireFleetPortalActor } from "../_lib/requireFleetPortalActor";

type Props = { searchParams: Promise<{ fleetId?: string }> };

export default async function PortalFleetMaintenancePage({
  searchParams,
}: Props) {
  const { fleetId } = await searchParams;
  const uiContext = await requireFleetPortalActor(fleetId ?? null);
  if (!uiContext.capabilities.canManageUnits) redirect("/portal/fleet");
  const selectedFleetId =
    fleetId && fleetId === uiContext.primaryFleetId ? fleetId : null;

  return (
    <FleetMaintenanceWorkspace
      uiContext={uiContext}
      routePrefix="/portal/fleet"
      initialFleetId={selectedFleetId}
    />
  );
}
