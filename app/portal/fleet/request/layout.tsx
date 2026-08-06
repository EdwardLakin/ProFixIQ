import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { requireFleetPortalActor } from "../_lib/requireFleetPortalActor";

export default async function FleetRequestLayout({
  children,
}: {
  children: ReactNode;
}) {
  const actor = await requireFleetPortalActor();
  if (!actor.capabilities.canManageUnits) redirect("/portal/fleet");

  return children;
}
