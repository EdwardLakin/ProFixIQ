import { redirect } from "next/navigation";

import FleetUnitEnrollmentPage from "@/features/fleet/components/FleetUnitEnrollmentPage";
import { requireFleetPortalActor } from "../../_lib/requireFleetPortalActor";

export default async function PortalFleetUnitEnrollmentPage() {
  const actor = await requireFleetPortalActor();

  if (!actor.capabilities.canManageUnits) {
    redirect("/portal/fleet/units");
  }

  return <FleetUnitEnrollmentPage routePrefix="/portal/fleet" />;
}
