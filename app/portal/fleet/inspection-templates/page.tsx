import { redirect } from "next/navigation";

import { requireFleetPortalActor } from "../_lib/requireFleetPortalActor";
import FleetPretripTemplateBuilder from "@/features/fleet/components/FleetPretripTemplateBuilder";

type Props = { searchParams: Promise<{ fleetId?: string }> };

export default async function FleetInspectionTemplatesPage({
  searchParams,
}: Props) {
  const { fleetId } = await searchParams;
  const actor = await requireFleetPortalActor(fleetId ?? null);
  if (!actor.capabilities.canManagePretripTemplates || !actor.primaryFleetId) {
    redirect("/portal/fleet");
  }

  return <FleetPretripTemplateBuilder fleetId={actor.primaryFleetId} />;
}
