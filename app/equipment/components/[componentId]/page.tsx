import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import EquipmentComponentDetailView from "@/features/equipment/components/EquipmentComponentDetailView";
import { isComponentId } from "@/features/equipment/lib/components";
import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
import { canWriteComponents } from "@/features/equipment/server/equipmentComponentRoutes";
import { loadComponentDetail } from "@/features/equipment/server/equipmentComponentService";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ComponentPageProps = {
  params: Promise<{ componentId: string }>;
};

/** One component's identity and its history across every machine it has served on. */
export default async function EquipmentComponentPage({ params }: ComponentPageProps) {
  noStore();

  const { profile, canonicalRole } = await requireShopPageAccess({
    allowRoles: EQUIPMENT_DIRECTORY_ROLES,
  });
  const { componentId } = await params;
  if (!isComponentId(componentId)) notFound();

  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled") {
    return (
      <EquipmentAccessState
        state={entitlement}
        retryHref={`/equipment/components/${componentId}`}
      />
    );
  }

  const detail = await loadComponentDetail({
    supabase: createServerSupabaseRSC(),
    admin: createAdminSupabase(),
    shopId: profile.shop_id,
    componentId,
  });
  if (!detail) notFound();

  return (
    <EquipmentComponentDetailView detail={detail} canEdit={canWriteComponents(canonicalRole)} />
  );
}
