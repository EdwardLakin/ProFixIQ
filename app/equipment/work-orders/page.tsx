import { unstable_noStore as noStore } from "next/cache";

import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import EquipmentSectionNav from "@/features/equipment/components/EquipmentSectionNav";
import EquipmentWorkOrdersView from "@/features/equipment/components/EquipmentWorkOrdersView";
import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
import { loadEquipmentWorkOrders } from "@/features/equipment/server/loadEquipmentWorkOrders";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EquipmentWorkOrdersPage() {
  noStore();

  const { profile, canonicalRole } = await requireShopPageAccess({
    allowRoles: EQUIPMENT_DIRECTORY_ROLES,
  });

  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled") {
    return <EquipmentAccessState state={entitlement} retryHref="/equipment/work-orders" />;
  }

  const workOrders = await loadEquipmentWorkOrders({
    admin: createAdminSupabase(),
    shopId: profile.shop_id,
    role: canonicalRole,
  });

  return (
    <>
      <EquipmentSectionNav current="work-orders" />
      <EquipmentWorkOrdersView rows={workOrders.rows} truncated={workOrders.truncated} />
    </>
  );
}
