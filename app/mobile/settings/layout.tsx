import type { ReactNode } from "react";

import MobileCommandRoute from "@/features/mobile/layout/MobileCommandRoute";

export default function MobileSettingsLayout({ children }: { children: ReactNode }) {
  return <MobileCommandRoute surface="settings">{children}</MobileCommandRoute>;
}
