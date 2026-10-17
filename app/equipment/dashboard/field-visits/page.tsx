import { parseDirectoryFilters } from "@/features/equipment/lib/equipmentDirectoryQuery";
import { unstable_noStore as noStore } from "next/cache";
import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import EquipmentFieldVisitsView from "@/features/equipment/components/EquipmentFieldVisitsView";
import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
import {
  loadEquipmentFieldVisits,
  parseEquipmentVisitWindow,
} from "@/features/equipment/server/loadEquipmentFieldVisits";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
} from "@/features/shared/lib/supabase/server";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function EquipmentFieldVisitsPage({
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
        retryHref="/equipment/dashboard/field-visits"
      />
    );
  const params = (await searchParams) ?? {};
  const data = await loadEquipmentFieldVisits({
    supabase: createServerSupabaseRSC(),
    admin: createAdminSupabase(),
    shopId: profile.shop_id,
    actorProfileId: profile.id,
    role: canonicalRole,
    window: parseEquipmentVisitWindow(params),
  });
  return (
    <EquipmentFieldVisitsView
      data={data}
      page={parseDirectoryFilters(params).page}
    />
  );
}
