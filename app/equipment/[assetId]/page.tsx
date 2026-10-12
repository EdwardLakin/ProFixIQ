import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import AssetHealthView from "@/features/equipment/components/AssetHealthView";
import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import { isAssetId } from "@/features/equipment/lib/assetProfile";
import { loadAssetHealth } from "@/features/equipment/server/loadAssetHealth";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import { VEHICLE_WORKSPACE_READER_ROLES } from "@/features/vehicles/lib/vehicleWorkspace";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AssetHealthPageProps = {
  params: Promise<{ assetId: string }>;
};

export default async function AssetHealthPage({ params }: AssetHealthPageProps) {
  noStore();

  const { profile, canonicalRole } = await requireShopPageAccess({
    allowRoles: VEHICLE_WORKSPACE_READER_ROLES,
  });
  const { assetId } = await params;
  if (!isAssetId(assetId)) notFound();

  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled") {
    return (
      <EquipmentAccessState state={entitlement} retryHref={`/equipment/${assetId}`} />
    );
  }

  // Missing, cross-shop and unassigned (mechanic) assets all 404 alike.
  const health = await loadAssetHealth({
    supabase: createServerSupabaseRSC(),
    admin: createAdminSupabase(),
    shopId: profile.shop_id,
    role: canonicalRole,
    assetId,
  });
  if (!health) notFound();

  return <AssetHealthView health={health} />;
}
