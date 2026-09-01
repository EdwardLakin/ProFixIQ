import { redirect } from "next/navigation";

import FleetMaintenanceCalendar from "@/features/fleet/components/FleetMaintenanceCalendar";
import { requireFleetPortalActor } from "../_lib/requireFleetPortalActor";

type Props = { searchParams: Promise<{ fleetId?: string }> };

export default async function FleetCalendarPage({ searchParams }: Props) {
  const { fleetId } = await searchParams;
  const actor = await requireFleetPortalActor(fleetId ?? null);
  if (!actor.capabilities.canManageUnits) redirect("/portal/fleet");

  return <FleetMaintenanceCalendar />;
}
