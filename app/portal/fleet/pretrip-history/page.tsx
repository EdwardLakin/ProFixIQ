import PretripReportsPage from "@/features/fleet/components/PretripReportsPage";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { getFleetPortalActorContext } from "../_lib/requireFleetPortalActor";

type Props = { searchParams: Promise<{ fleetId?: string }> };

export default async function PortalFleetPretripHistoryPage({
  searchParams,
}: Props) {
  const { fleetId } = await searchParams;
  const actor = await getFleetPortalActorContext(fleetId ?? null);
  const uiContext = getFleetUiContext(actor);

  return (
    <PretripReportsPage
      uiContext={uiContext}
      routePrefix="/portal/fleet"
      fleetId={fleetId ? actor.primaryFleetId : null}
    />
  );
}
