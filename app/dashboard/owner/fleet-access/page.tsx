import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import { FLEET_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
import FleetPortalAccessManager from "@/features/fleet/components/FleetPortalAccessManager";

export default async function FleetAccessInvitesPage() {
  await requireShopPageAccess({
    requiredCapability: "canInviteFleetMembers",
    requiredProductCapabilities: FLEET_PRODUCT_CAPABILITIES,
  });
  return <FleetPortalAccessManager />;
}
