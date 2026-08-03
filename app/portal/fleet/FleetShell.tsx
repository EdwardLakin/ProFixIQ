"use client";

import React from "react";

import {
  OperationsPortalShell,
  fleetOperationsRoutes,
  type OperationsPortalNavItem,
} from "@/features/operations";

const NAV: OperationsPortalNavItem[] = [
  { href: fleetOperationsRoutes.portalHome, label: "Overview" },
  { href: fleetOperationsRoutes.assetDetailBase, label: "Units" },
  { href: "/portal/fleet/maintenance", label: "Maintenance" },
  { href: fleetOperationsRoutes.portalRequests, label: "Requests" },
  { href: "/portal/fleet/billing", label: "Billing" },
];

export default function FleetShell({
  title = "Fleet Portal",
  subtitle = "Units, maintenance, requests, approvals, and invoices in one place",
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
