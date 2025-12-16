// app/portal/layout.tsx
import React from "react";
import PortalAppShell from "@/features/portal/components/PortalShell";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalAppShell>{children}</PortalAppShell>;
}