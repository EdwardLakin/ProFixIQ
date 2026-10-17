import { loadEquipmentOperationCounts } from "@/features/equipment/server/loadEquipmentOperationCounts";
import {
  loadEquipmentFieldVisits,
  equipmentVisitWindow,
  equipmentFieldVisitsHref,
} from "@/features/equipment/server/loadEquipmentFieldVisits";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { unstable_noStore as noStore } from "next/cache";

import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import EquipmentDashboardView from "@/features/equipment/components/EquipmentDashboardView";
import EquipmentOperationsBoard from "@/features/equipment/components/EquipmentOperationsBoard";
import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
import { loadEquipmentFleetSummary } from "@/features/equipment/server/loadEquipmentFleetSummary";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EquipmentDashboardPage() {
  noStore();

  const { profile, canonicalRole } = await requireShopPageAccess({
    allowRoles: EQUIPMENT_DIRECTORY_ROLES,
  });

  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled") {
    return (
      <EquipmentAccessState
        state={entitlement}
        retryHref="/equipment/dashboard"
      />
    );
  }

  const input = {
    supabase: createServerSupabaseRSC(),
    admin: createAdminSupabase(),
    shopId: profile.shop_id,
    role: canonicalRole,
  };
  const window = equipmentVisitWindow();
  const fieldHref = equipmentFieldVisitsHref(window);
  const fieldPromise = getActorCapabilities({ role: canonicalRole })
    .canManageScheduling
    ? loadEquipmentFieldVisits({ ...input, actorProfileId: profile.id, window })
        .then((data) => ({
          value: data.rows.length,
          partial: data.partial,
          href: fieldHref,
        }))
        .catch(() => ({ value: null, partial: false, href: fieldHref }))
    : Promise.resolve({ value: null, partial: false, href: fieldHref });
  const [summary, counts, field] = await Promise.all([
    loadEquipmentFleetSummary(input),
    loadEquipmentOperationCounts(input),
    fieldPromise,
  ]);

  return (
    <EquipmentDashboardView
      summary={summary}
      operations={
        <EquipmentOperationsBoard
          summary={summary}
          role={canonicalRole}
          operations={{ ...counts, field }}
        />
      }
    />
  );
}
