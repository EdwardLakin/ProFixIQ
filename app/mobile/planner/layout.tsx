import type { ReactNode } from "react";

import MobileCommandRoute from "@/features/mobile/layout/MobileCommandRoute";

export default function MobilePlannerLayout({ children }: { children: ReactNode }) {
  return <MobileCommandRoute surface="planner">{children}</MobileCommandRoute>;
}
