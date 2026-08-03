import type { ReactNode } from "react";

import MobileCommandRoute from "@/features/mobile/layout/MobileCommandRoute";

export default function MobileWorkforceLayout({ children }: { children: ReactNode }) {
  return <MobileCommandRoute surface="workforce">{children}</MobileCommandRoute>;
}
