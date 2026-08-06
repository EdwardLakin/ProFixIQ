import { redirect } from "next/navigation";

import { requireFleetPortalActor } from "../_lib/requireFleetPortalActor";
import FleetPretripTemplateBuilder from "@/features/fleet/components/FleetPretripTemplateBuilder";

export default async function FleetInspectionTemplatesPage() {
  const actor = await requireFleetPortalActor();
  if (!actor.capabilities.canManagePretripTemplates || !actor.primaryFleetId) {
    redirect("/portal/fleet");
  }

  return <FleetPretripTemplateBuilder fleetId={actor.primaryFleetId} />;
}
