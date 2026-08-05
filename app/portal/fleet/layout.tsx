import type { ReactNode } from "react";
import type { Metadata } from "next";
import FleetProductShell from "@/features/fleet/components/FleetProductShell";
import { requireFleetPortalActor } from "./_lib/requireFleetPortalActor";

export const metadata: Metadata = {
  title: "ProFixIQ Fleet | Maintenance Command",
  description:
    "Fleet asset readiness, preventive maintenance, service approvals, history and costs in one connected workspace.",
  applicationName: "ProFixIQ Fleet",
};

export default async function PortalFleetLayout({
  children,
}: {
  children: ReactNode;
}) {
  const actor = await requireFleetPortalActor();

  const subtitle =
    actor.experience === "external_driver"
      ? "Assigned assets, pre-trips and reported defects"
      : "Asset readiness, preventive maintenance and repair decisions";

  return (
    <FleetProductShell
      title="ProFixIQ Fleet"
      subtitle={subtitle}
      actorLabel={actor.actorLabel}
      experience={actor.experience}
      userId={actor.userId}
    >
      {children}
    </FleetProductShell>
  );
}
