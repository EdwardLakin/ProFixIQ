import { unstable_noStore as noStore } from "next/cache";

import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import EquipmentDirectoryView from "@/features/equipment/components/EquipmentDirectoryView";
import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
import { loadEquipmentDirectory } from "@/features/equipment/server/loadEquipmentDirectory";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EquipmentDirectoryPage() {
  noStore();

  const { profile, canonicalRole } = await requireShopPageAccess({
    allowRoles: EQUIPMENT_DIRECTORY_ROLES,
  });

  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled") {
    return <EquipmentAccessState state={entitlement} retryHref="/equipment" />;
  }

  const directory = await loadEquipmentDirectory({
    supabase: createServerSupabaseRSC(),
    admin: createAdminSupabase(),
    shopId: profile.shop_id,
    role: canonicalRole,
  });

  return <EquipmentDirectoryView rows={directory.rows} truncated={directory.truncated} />;
}
