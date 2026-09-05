import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import FleetPortalAccessManager from "@/features/fleet/components/FleetPortalAccessManager";

export const dynamic = "force-dynamic";

export default async function FieldFleetInvitesPage() {
  await requireShopPageAccess({
    requiredCapability: "canInviteFleetMembers",
    redirectTo: "/mobile/service",
  });

  return <FleetPortalAccessManager />;
}
