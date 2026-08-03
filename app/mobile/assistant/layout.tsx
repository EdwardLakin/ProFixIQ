import type { ReactNode } from "react";

import MobileCommandRoute from "@/features/mobile/layout/MobileCommandRoute";

export default function MobileAssistantLayout({ children }: { children: ReactNode }) {
  return <MobileCommandRoute surface="assistant">{children}</MobileCommandRoute>;
}
