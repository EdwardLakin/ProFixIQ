import type { ReactNode } from "react";

import MobileCommandRoute from "@/features/mobile/layout/MobileCommandRoute";

export default function MobileCustomersLayout({ children }: { children: ReactNode }) {
  return <MobileCommandRoute surface="customers">{children}</MobileCommandRoute>;
}
