import type { ReactNode } from "react";

import MobileFieldServiceRouteGate from "@/features/mobile/service/MobileFieldServiceRouteGate";

export default function MobileFieldServiceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <MobileFieldServiceRouteGate>{children}</MobileFieldServiceRouteGate>;
}
