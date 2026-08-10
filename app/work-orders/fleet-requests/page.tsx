import ShopFleetRequestInbox from "@/features/fleet/components/ShopFleetRequestInbox";
import { SHOP_FLEET_REQUEST_INTAKE_ROLES } from "@/features/fleet/lib/shopFleetRequestIntake";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function ShopFleetRequestsPage() {
  await requireShopPageAccess({ allowRoles: SHOP_FLEET_REQUEST_INTAKE_ROLES });

  return <ShopFleetRequestInbox />;
}
