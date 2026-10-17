import { vehicleWorkspacePermissionsForRole } from "@/features/vehicles/server/vehicleWorkspacePermissions";
import { unstable_noStore as noStore } from "next/cache";
import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import EquipmentWorkQueueView from "@/features/equipment/components/EquipmentWorkQueueView";
import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
import { parseEquipmentQueueFilters } from "@/features/equipment/lib/equipmentWorkQueue";
import { loadEquipmentWorkQueue } from "@/features/equipment/server/loadEquipmentWorkQueue";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EquipmentWorkQueuePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  noStore();
  const { profile, canonicalRole } = await requireShopPageAccess({
    allowRoles: EQUIPMENT_DIRECTORY_ROLES,
  });
  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled")
    return (
      <EquipmentAccessState
        state={entitlement}
        retryHref="/equipment/work-orders"
      />
    );
  const filters = parseEquipmentQueueFilters((await searchParams) ?? {});
  const queue = await loadEquipmentWorkQueue({
    supabase: createServerSupabaseRSC(),
    admin: createAdminSupabase(),
    shopId: profile.shop_id,
    role: canonicalRole,
    filters,
  });
  return <EquipmentWorkQueueView queue={queue} filters={filters} canCreateWorkOrder={vehicleWorkspacePermissionsForRole(canonicalRole).canCreateWorkOrder} />;
}
