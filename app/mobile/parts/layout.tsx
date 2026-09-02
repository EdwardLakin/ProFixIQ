import type { ReactNode } from "react";

import MobileCommandRoute from "@/features/mobile/layout/MobileCommandRoute";
import MobilePartsRouteGate from "@/features/parts/mobile/MobilePartsRouteGate";
import { SHOP_OR_FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function MobilePartsLayout({ children }: { children: ReactNode }) {
  await requireShopPageAccess({
    requiredCapability: "canManageParts",
    requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  });
  return (
    <MobilePartsRouteGate>
      <MobileCommandRoute surface="parts">{children}</MobileCommandRoute>
    </MobilePartsRouteGate>
  );
}
