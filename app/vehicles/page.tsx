export const dynamic = "force-dynamic";
export const revalidate = 0;

import VehicleFilesPage from "@/features/vehicles/app/vehicles/page";
import { VEHICLE_WORKSPACE_READER_ROLES } from "@/features/vehicles/lib/vehicleWorkspace";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function VehiclesPage() {
  const { canonicalRole } = await requireShopPageAccess({
    allowRoles: VEHICLE_WORKSPACE_READER_ROLES,
  });

  return (
    <VehicleFilesPage
      canManageVehicles={[
        "owner",
        "admin",
        "manager",
        "advisor",
      ].includes(canonicalRole)}
    />
  );
}
