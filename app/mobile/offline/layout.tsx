import type { ReactNode } from "react";

import MobileCommandRoute from "@/features/mobile/layout/MobileCommandRoute";

export default function MobileOfflineLayout({ children }: { children: ReactNode }) {
  return <MobileCommandRoute surface="offline">{children}</MobileCommandRoute>;
}
