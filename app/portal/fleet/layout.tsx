import type { ReactNode } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import FleetProductShell from "@/features/fleet/components/FleetProductShell";
import { isFleetProductHostname } from "@/features/fleet/lib/fleetProductRouting";
import { requireFleetPortalActor } from "./_lib/requireFleetPortalActor";

export const metadata: Metadata = {
  metadataBase: new URL("https://fleet.profixiq.com"),
  title: "ProFixIQ Fleet | Maintenance Command",
  description:
    "Fleet asset readiness, preventive maintenance, service approvals, history and costs in one connected workspace.",
  applicationName: "ProFixIQ Fleet",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "ProFixIQ Fleet",
    title: "ProFixIQ Fleet | Maintenance Command",
    description:
      "Fleet asset readiness, preventive maintenance, service approvals, history and costs in one connected workspace.",
  },
};

export default async function PortalFleetLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [actor, requestHeaders] = await Promise.all([
    requireFleetPortalActor(),
    headers(),
  ]);
  const productHost =
    requestHeaders.get("x-profixiq-product-host") === "fleet" ||
    isFleetProductHostname(
      requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
    );

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
      productHost={productHost}
    >
      {children}
    </FleetProductShell>
  );
}
