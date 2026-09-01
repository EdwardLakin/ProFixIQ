import FleetDriverDashboard from "@/features/fleet/components/FleetDriverDashboard";
import { requireFleetPortalActor } from "../_lib/requireFleetPortalActor";
import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ fleetId?: string }> };

export default async function FleetDriverUpdatesPage({ searchParams }: Props) {
  const { fleetId } = await searchParams;
  const actor = await requireFleetPortalActor(fleetId ?? null);
  if (actor.actorType !== "fleet_driver") redirect("/portal/fleet");
  return <FleetDriverDashboard view="updates" />;
}
