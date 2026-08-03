import type { ReactNode } from "react";

import MobileCommandRoute from "@/features/mobile/layout/MobileCommandRoute";

export default function MobileDispatchLayout({ children }: { children: ReactNode }) {
  return <MobileCommandRoute surface="dispatch">{children}</MobileCommandRoute>;
}
