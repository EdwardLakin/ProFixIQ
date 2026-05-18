"use client";

import React from "react";

import {
  OperationsPortalShell,
  fleetOperationsRoutes,
  fleetOperationsTerminology,
  type OperationsPortalNavItem,
} from "@/features/operations";

const NAV: OperationsPortalNavItem[] = [
  { href: fleetOperationsRoutes.portalHome, label: "Dashboard" },
  {
    href: fleetOperationsRoutes.portalRequests,
    label: fleetOperationsTerminology.requestPluralLabel,
  },
  {
    href: fleetOperationsRoutes.portalInspections,
    label: fleetOperationsTerminology.inspectionPluralLabel,
  },
];

export default function FleetShell({
  title = fleetOperationsTerminology.portalLabel,
  subtitle = `Dispatch view for pre-trips, ${fleetOperationsTerminology.requestPluralLabel.toLowerCase()}, and fleet history`,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <OperationsPortalShell
      title={title}
      subtitle={subtitle}
      badgeLabel="Fleet Ops"
      accentColor="#38BDF8"
      nav={NAV}
    >
      {children}
    </OperationsPortalShell>
  );
}
