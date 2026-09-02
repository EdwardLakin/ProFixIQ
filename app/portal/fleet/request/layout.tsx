import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { canManageFleetForActor } from "@/features/fleet/lib/resolveFleetActorContext";
import { getFleetPortalActorContext } from "../_lib/requireFleetPortalActor";

export default async function FleetRequestLayout({
  children,
}: {
  children: ReactNode;
}) {
  const actor = await getFleetPortalActorContext();
  const canManageUnits = actor.fleetIds.some((fleetId) =>
    canManageFleetForActor(actor, fleetId),
  );
  if (!canManageUnits) redirect("/portal/fleet");

  return children;
}
