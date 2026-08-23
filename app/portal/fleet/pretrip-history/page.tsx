import PretripReportsPage from "@/features/fleet/components/PretripReportsPage";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { getFleetPortalActorContext } from "../_lib/requireFleetPortalActor";

export default async function PortalFleetPretripHistoryPage() {
  const actor = await getFleetPortalActorContext();
  const uiContext = getFleetUiContext(actor);

  return (
    <PretripReportsPage uiContext={uiContext} routePrefix="/portal/fleet" />
  );
}
