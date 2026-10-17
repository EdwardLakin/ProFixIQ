import { unstable_noStore as noStore } from "next/cache";
import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import EquipmentCustomersView from "@/features/equipment/components/EquipmentCustomersView";
import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
import { parseDirectoryFilters } from "@/features/equipment/lib/equipmentDirectoryQuery";
import { equipmentCustomers } from "@/features/equipment/lib/equipmentCustomers";
import { loadEquipmentAssetList } from "@/features/equipment/server/loadEquipmentAssetList";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
} from "@/features/shared/lib/supabase/server";
import { vehicleWorkspacePermissionsForRole } from "@/features/vehicles/server/vehicleWorkspacePermissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EquipmentCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  noStore();
  const { profile, canonicalRole } = await requireShopPageAccess({
    allowRoles: EQUIPMENT_DIRECTORY_ROLES,
  });
  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled")
    return (
      <EquipmentAccessState
        state={entitlement}
        retryHref="/equipment/customers"
      />
    );
  const filters = parseDirectoryFilters(await searchParams);
  const canOpenAccount =
    vehicleWorkspacePermissionsForRole(canonicalRole).canOpenAccount;
  try {
    const index = await loadEquipmentAssetList({
      supabase: createServerSupabaseRSC(),
      admin: createAdminSupabase(),
      shopId: profile.shop_id,
    });
    return (
      <EquipmentCustomersView
        customers={equipmentCustomers(index.rows)}
        capped={index.capped}
        filters={filters}
        canOpenAccount={canOpenAccount}
      />
    );
  } catch {
    return (
      <EquipmentCustomersView
        error
        filters={filters}
        canOpenAccount={canOpenAccount}
      />
    );
  }
}
