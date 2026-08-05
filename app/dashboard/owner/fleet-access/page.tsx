import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import FleetPortalAccessManager from "@/features/fleet/components/FleetPortalAccessManager";

export default async function FleetAccessInvitesPage() {
  await requireShopPageAccess({ requiredCapability: "canInviteFleetMembers" });
  return <FleetPortalAccessManager />;
}
