import type { ReactNode } from "react";

import MobileCommandRoute from "@/features/mobile/layout/MobileCommandRoute";

export default function MobileFleetLayout({ children }: { children: ReactNode }) {
  return <MobileCommandRoute surface="fleet">{children}</MobileCommandRoute>;
}
