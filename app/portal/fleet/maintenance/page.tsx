import { redirect } from "next/navigation";

import FleetMaintenanceWorkspace from "@/features/fleet/components/FleetMaintenanceWorkspace";
import { requireFleetPortalActor } from "../_lib/requireFleetPortalActor";

export default async function PortalFleetMaintenancePage() {
  const uiContext = await requireFleetPortalActor();
  if (!uiContext.capabilities.canManageUnits) redirect("/portal/fleet");

  return (
    <FleetMaintenanceWorkspace
      uiContext={uiContext}
      routePrefix="/portal/fleet"
    />
  );
}
