import { redirect } from "next/navigation";

import FleetServiceRequestsPage from "@/features/fleet/components/FleetServiceRequestsPage";
import { requireFleetPortalActor } from "../_lib/requireFleetPortalActor";

export default async function PortalFleetServiceRequestsPage() {
  const uiContext = await requireFleetPortalActor();
  if (!uiContext.capabilities.canViewServiceRequests) redirect("/portal/fleet");

  return <FleetServiceRequestsPage uiContext={uiContext} />;
}
