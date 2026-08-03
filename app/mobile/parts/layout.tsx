import type { ReactNode } from "react";

import MobileCommandRoute from "@/features/mobile/layout/MobileCommandRoute";

export default function MobilePartsLayout({ children }: { children: ReactNode }) {
  return <MobileCommandRoute surface="parts">{children}</MobileCommandRoute>;
}
