import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import CustomerPortalQrBuilder from "@/features/portal/components/CustomerPortalQrBuilder";

export default async function CustomerPortalQrPage() {
  await requireShopPageAccess({ requiredCapability: "canManagePortalQr" });
  return <CustomerPortalQrBuilder />;
}
