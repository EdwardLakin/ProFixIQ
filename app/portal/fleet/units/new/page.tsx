import { redirect } from "next/navigation";

import FleetUnitEnrollmentPage from "@/features/fleet/components/FleetUnitEnrollmentPage";
import { requireFleetPortalActor } from "../../_lib/requireFleetPortalActor";

type Props = { searchParams: Promise<{ fleetId?: string }> };

export default async function PortalFleetUnitEnrollmentPage({
  searchParams,
}: Props) {
  const { fleetId } = await searchParams;
  const actor = await requireFleetPortalActor(fleetId ?? null);

  if (!actor.capabilities.canManageUnits) {
    redirect("/portal/fleet/units");
  }

  return (
    <FleetUnitEnrollmentPage
      routePrefix="/portal/fleet"
      initialFleetId={fleetId ? actor.primaryFleetId : null}
    />
  );
}
