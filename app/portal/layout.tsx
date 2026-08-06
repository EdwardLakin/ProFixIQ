// app/portal/layout.tsx
import type { ReactNode } from "react";
import { headers } from "next/headers";
import PortalShell from "@/features/portal/components/PortalShell";
import { isFleetProductHostname } from "@/features/fleet/lib/fleetProductRouting";

export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const requestHeaders = await headers();
  const isFleetProductHost =
    requestHeaders.get("x-profixiq-product-host") === "fleet" ||
    isFleetProductHostname(
      requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
    );

  if (isFleetProductHost) return children;

  return <PortalShell>{children}</PortalShell>;
}
