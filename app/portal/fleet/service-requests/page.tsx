import { redirect } from "next/navigation";

import FleetServiceRequestsPage from "@/features/fleet/components/FleetServiceRequestsPage";
import { requireFleetPortalActor } from "../_lib/requireFleetPortalActor";

type Props = { searchParams: Promise<{ fleetId?: string }> };

export default async function PortalFleetServiceRequestsPage({
  searchParams,
}: Props) {
  const { fleetId } = await searchParams;
  const uiContext = await requireFleetPortalActor(fleetId ?? null);
  if (!uiContext.capabilities.canViewServiceRequests) redirect("/portal/fleet");
  const selectedFleetId =
    fleetId && fleetId === uiContext.primaryFleetId ? fleetId : null;

  return (
    <FleetServiceRequestsPage
      uiContext={uiContext}
      fleetId={selectedFleetId}
    />
  );
}
