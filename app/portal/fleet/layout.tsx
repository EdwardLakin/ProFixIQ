import type { ReactNode } from "react";
import FleetShell from "./FleetShell";
import { requireFleetPortalActor } from "./_lib/requireFleetPortalActor";

export default async function PortalFleetLayout({
  children,
}: {
  children: ReactNode;
}) {
  const actor = await requireFleetPortalActor();

  const subtitle =
    actor.experience === "external_driver"
      ? "Driver pre-trip, assigned units, and request visibility"
      : "Fleet operations, service request follow-through, and dispatch visibility";

  return (
    <FleetShell title="Fleet Portal" subtitle={subtitle}>
      {children}
    </FleetShell>
  );
}
