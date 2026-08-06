import FleetDriverDashboard from "@/features/fleet/components/FleetDriverDashboard";
import { requireFleetPortalActor } from "../_lib/requireFleetPortalActor";
import { redirect } from "next/navigation";

export default async function FleetDriverUpdatesPage() {
  const actor = await requireFleetPortalActor();
  if (actor.actorType !== "fleet_driver") redirect("/portal/fleet");
  return <FleetDriverDashboard view="updates" />;
}
