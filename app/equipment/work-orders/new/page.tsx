import { unstable_noStore as noStore } from "next/cache";

import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import EquipmentWorkOrderAssetPicker from "@/features/equipment/components/EquipmentWorkOrderAssetPicker";
import { parseDirectoryFilters } from "@/features/equipment/lib/equipmentDirectoryQuery";
import { loadEquipmentDirectoryPage } from "@/features/equipment/server/loadEquipmentDirectoryPage";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EquipmentNewWorkOrderPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  noStore();
  const { profile, canonicalRole } = await requireShopPageAccess({
    allowRoles: ROLE_GROUPS.workOrderCreators,
  });
  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled") {
    return (
      <EquipmentAccessState
        state={entitlement}
        retryHref="/equipment/work-orders/new"
      />
    );
  }

  const params = (await searchParams) ?? {};
  // The picker offers identity search only; keep PM/evidence filters in Assets.
  const filters = parseDirectoryFilters({
    q: params.q,
    customer: params.customer,
    page: params.page,
  });
  const directory = await loadEquipmentDirectoryPage({
    supabase: createServerSupabaseRSC(),
    admin: createAdminSupabase(),
    shopId: profile.shop_id,
    role: canonicalRole,
    filters,
  });

  return (
    <EquipmentWorkOrderAssetPicker directory={directory} filters={filters} />
  );
}
