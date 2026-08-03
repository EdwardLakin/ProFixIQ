import type { ReactNode } from "react";

import MobileCommandRoute from "@/features/mobile/layout/MobileCommandRoute";

export default function MobileTechLayout({ children }: { children: ReactNode }) {
  return <MobileCommandRoute surface="tech">{children}</MobileCommandRoute>;
}
