import type { ReactNode } from "react";

import MobileCommandRoute from "@/features/mobile/layout/MobileCommandRoute";
import { SHOP_OR_FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function MobileInspectionsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireShopPageAccess({
    requiredCapability: "canRunInspections",
    requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  });
  return (
    <MobileCommandRoute surface="inspections">{children}</MobileCommandRoute>
  );
}
