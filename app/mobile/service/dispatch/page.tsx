import DispatchBoardClient from "app/dashboard/dispatch/DispatchBoardClient";
import { FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export const dynamic = "force-dynamic";

export default async function FieldDispatchPage() {
  await requireShopPageAccess({
    requiredCapability: "canManageScheduling",
    requiredProductCapabilities: FIELD_PRODUCT_CAPABILITIES,
    redirectTo: "/mobile/service",
  });

  return <DispatchBoardClient surface="field" />;
}
