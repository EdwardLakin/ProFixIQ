import type { ReactNode } from "react";
import {
  OperationsPortalShell,
  propertyOperationsRoutes,
  propertyOperationsTerminology,
} from "@/features/operations";

export default function PortalPropertyLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <OperationsPortalShell
      title={propertyOperationsTerminology.portalLabel}
      subtitle="Static property maintenance placeholder for branch-aware operations UI"
      badgeLabel="Property"
      accentColor="#C57A4A"
      enableAuthControls={false}
      nav={[
        { href: propertyOperationsRoutes.portalHome, label: "Dashboard" },
        {
          href: propertyOperationsRoutes.portalRequests,
          label: propertyOperationsTerminology.requestPluralLabel,
        },
        {
          href: propertyOperationsRoutes.portalInspections,
          label: propertyOperationsTerminology.inspectionPluralLabel,
        },
      ]}
    >
      {children}
    </OperationsPortalShell>
  );
}
