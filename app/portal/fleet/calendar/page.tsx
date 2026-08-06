import { redirect } from "next/navigation";

import FleetMaintenanceCalendar from "@/features/fleet/components/FleetMaintenanceCalendar";
import { requireFleetPortalActor } from "../_lib/requireFleetPortalActor";

export default async function FleetCalendarPage() {
  const actor = await requireFleetPortalActor();
  if (actor.experience === "external_driver") redirect("/portal/fleet");

  return <FleetMaintenanceCalendar />;
}
