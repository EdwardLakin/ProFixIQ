import type { ReactNode } from "react";

import MobileCommandRoute from "@/features/mobile/layout/MobileCommandRoute";

export default function MobileWorkOrdersLayout({ children }: { children: ReactNode }) {
  return <MobileCommandRoute surface="work-orders">{children}</MobileCommandRoute>;
}
