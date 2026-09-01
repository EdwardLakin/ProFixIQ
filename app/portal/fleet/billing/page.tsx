import { redirect } from "next/navigation";

import FleetBillingWorkspace from "@/features/fleet/components/FleetBillingWorkspace";
import { requireFleetPortalActor } from "../_lib/requireFleetPortalActor";

type Props = {
  searchParams: Promise<{
    fleetId?: string;
    workOrderId?: string;
    filter?: string;
  }>;
};

export default async function PortalFleetBillingPage({ searchParams }: Props) {
  const query = await searchParams;
  const actor = await requireFleetPortalActor(query.fleetId ?? null);
  if (!actor.capabilities.canManageUnits) redirect("/portal/fleet");
  const selectedFleetId =
    query.fleetId && query.fleetId === actor.primaryFleetId
      ? query.fleetId
      : null;

  return (
    <FleetBillingWorkspace
      routePrefix="/portal/fleet"
      fleetId={selectedFleetId}
      initialWorkOrderId={query.workOrderId}
      initialFilter={query.filter}
    />
  );
}
