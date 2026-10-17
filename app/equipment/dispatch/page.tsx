import { unstable_noStore as noStore } from "next/cache";
import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import EquipmentDispatchView from "@/features/equipment/dispatch/components/EquipmentDispatchView";
import { loadEquipmentDispatch } from "@/features/equipment/dispatch/server/loadEquipmentDispatch";
import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
import { parseEquipmentQueueFilters } from "@/features/equipment/lib/equipmentWorkQueue";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EquipmentDispatchPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  noStore();
  const { profile, canonicalRole } = await requireShopPageAccess({
    allowRoles: EQUIPMENT_DIRECTORY_ROLES,
    requiredCapability: "canManageScheduling",
  });
  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled")
    return (
      <EquipmentAccessState
        state={entitlement}
        retryHref="/equipment/dispatch"
      />
    );
  const params = (await searchParams) ?? {};
  const filters = parseEquipmentQueueFilters(params);
  const workOrderId =
    typeof params.workOrder === "string" ? params.workOrder : "";
  try {
    const data = await loadEquipmentDispatch({
      supabase: createServerSupabaseRSC(),
      admin: createAdminSupabase(),
      shopId: profile.shop_id,
      actorUserId: profile.id,
      role: canonicalRole,
      filters,
      workOrderId,
    });
    return (
      <EquipmentDispatchView
        data={data}
        filters={filters}
        shopId={profile.shop_id}
        actorId={profile.id}
      />
    );
  } catch {
    return (
      <EquipmentDispatchView
        error
        filters={filters}
        shopId={profile.shop_id}
        actorId={profile.id}
      />
    );
  }
}
