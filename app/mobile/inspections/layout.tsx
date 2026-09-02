import type { ReactNode } from "react";

import MobileCommandRoute from "@/features/mobile/layout/MobileCommandRoute";
import { requireCanonicalShopOrFieldPageAccess } from "@/features/mobile/service/server/access";

export default async function MobileInspectionsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireCanonicalShopOrFieldPageAccess({
    requiredCapability: "canRunInspections",
    redirectTo: "/mobile",
  });
  return (
    <MobileCommandRoute surface="inspections">{children}</MobileCommandRoute>
  );
}
