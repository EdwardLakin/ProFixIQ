import FieldInvoicesHistory from "@/features/mobile/service/FieldInvoicesHistory";
import { FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export const dynamic = "force-dynamic";

export default async function FieldInvoicesHistoryPage() {
  await requireShopPageAccess({
    requiredCapability: "canManageWorkOrders",
    requiredProductCapabilities: FIELD_PRODUCT_CAPABILITIES,
    redirectTo: "/mobile/service",
  });

  return <FieldInvoicesHistory />;
}
