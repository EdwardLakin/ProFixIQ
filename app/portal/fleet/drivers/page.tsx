import { redirect } from "next/navigation";

import FleetDriversWorkspace from "@/features/fleet/components/FleetDriversWorkspace";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { getFleetPortalActorContext } from "../_lib/requireFleetPortalActor";

type Props = { searchParams: Promise<{ fleetId?: string }> };

export default async function FleetDriversPage({ searchParams }: Props) {
  const { fleetId } = await searchParams;
  const actor = await getFleetPortalActorContext(fleetId ?? null);
  const uiContext = getFleetUiContext(actor);
  if (!uiContext.capabilities.canManageUnits) redirect("/portal/fleet");

  return <FleetDriversWorkspace actorLabel={uiContext.actorLabel} />;
}
