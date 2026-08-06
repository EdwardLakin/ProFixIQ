import { redirect } from "next/navigation";

import FleetDispatchBoard from "@/features/fleet/components/FleetDispatchBoard";
import { requireFleetPortalActor } from "../_lib/requireFleetPortalActor";

export default async function PortalFleetBoardPage() {
  const uiContext = await requireFleetPortalActor();
  if (!uiContext.capabilities.canManageUnits) redirect("/portal/fleet");

  return (
    <FleetDispatchBoard uiContext={uiContext} routePrefix="/portal/fleet" />
  );
}
