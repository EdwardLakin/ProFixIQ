import { redirect } from "next/navigation";

import FleetBillingWorkspace from "@/features/fleet/components/FleetBillingWorkspace";
import { requireFleetPortalActor } from "../_lib/requireFleetPortalActor";

type Props = {
  searchParams: Promise<{ workOrderId?: string; filter?: string }>;
};

export default async function PortalFleetBillingPage({ searchParams }: Props) {
  const [query, actor] = await Promise.all([
    searchParams,
    requireFleetPortalActor(),
  ]);
  if (!actor.capabilities.canManageUnits) redirect("/portal/fleet");

  return (
    <FleetBillingWorkspace
      routePrefix="/portal/fleet"
      initialWorkOrderId={query.workOrderId}
      initialFilter={query.filter}
    />
  );
}
