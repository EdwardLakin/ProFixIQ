import type { ReactNode } from "react";

import MobileCommandRoute from "@/features/mobile/layout/MobileCommandRoute";

export default function MobileMessagesLayout({ children }: { children: ReactNode }) {
  return <MobileCommandRoute surface="messages">{children}</MobileCommandRoute>;
}
