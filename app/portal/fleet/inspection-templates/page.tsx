import { redirect } from "next/navigation";

import { getFleetPortalActorContext } from "../_lib/requireFleetPortalActor";
import FleetPretripTemplateBuilder from "@/features/fleet/components/FleetPretripTemplateBuilder";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { canAdministerFleetForActor } from "@/features/fleet/lib/resolveFleetActorContext";

type Props = { searchParams: Promise<{ fleetId?: string }> };

export default async function FleetInspectionTemplatesPage({
  searchParams,
}: Props) {
  const { fleetId } = await searchParams;
  const actor = await getFleetPortalActorContext(fleetId ?? null);
  const uiContext = getFleetUiContext(actor);
  if (
    !uiContext.capabilities.canManagePretripTemplates ||
    !actor.primaryFleetId ||
    !canAdministerFleetForActor(actor, actor.primaryFleetId)
  ) {
    redirect("/portal/fleet");
  }

  return <FleetPretripTemplateBuilder fleetId={actor.primaryFleetId} />;
}
