import { unstable_noStore as noStore } from "next/cache";

import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import EquipmentFieldEntryView from "@/features/equipment/components/EquipmentFieldEntryView";
import {
  EQUIPMENT_FIELD_ENTRY_ROLES,
  equipmentFieldEntryState,
} from "@/features/equipment/lib/equipmentFieldEntry";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import {
  getMobileFieldServiceAccess,
  type ShopAccess,
} from "@/features/mobile/service/server/access";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Equipment-branded technician entry, built for a phone or tablet on a
 * jobsite. The links only appear when the canonical Field access check passes
 * (operator assignment and field configuration), so each one opens a usable
 * canonical mobile surface, which still applies its own authorization.
 */
export default async function EquipmentFieldPage() {
  noStore();

  const { profile, canonicalRole } = await requireShopPageAccess({
    allowRoles: EQUIPMENT_FIELD_ENTRY_ROLES,
  });

  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled") {
    return <EquipmentAccessState state={entitlement} retryHref="/equipment/field" />;
  }

  const supabase = createServerSupabaseRSC();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fail closed: if the canonical Field check cannot be read, show the
  // unavailable state rather than links that may lead to a denial.
  let state: ReturnType<typeof equipmentFieldEntryState> = "unavailable";
  let canConfigure = false;
  try {
    // getMobileFieldServiceAccess reads only supabase, profile, canonicalRole and
    // authUserId; the route-client typing of ShopAccess is the only mismatch.
    const fieldAccess = await getMobileFieldServiceAccess({
      supabase,
      profile,
      canonicalRole,
      authUserId: user?.id ?? profile.id,
    } as unknown as ShopAccess);
    state = equipmentFieldEntryState(fieldAccess);
    canConfigure = fieldAccess.canConfigure;
  } catch (error) {
    console.error("[equipment/field] field access check failed", error);
  }

  return <EquipmentFieldEntryView state={state} canConfigure={canConfigure} />;
}
