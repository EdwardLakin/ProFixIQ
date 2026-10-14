import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import AssetHealthView from "@/features/equipment/components/AssetHealthView";
import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import EquipmentSetupChecklist from "@/features/equipment/components/EquipmentSetupChecklist";
import { isAssetId } from "@/features/equipment/lib/assetProfile";
import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
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

  const supabase = createServerSupabaseRSC();
  const admin = createAdminSupabase();

  // Missing, cross-shop and unassigned (mechanic) assets all 404 alike.
  const health = await loadAssetHealth({
    supabase,
    admin,
    shopId: profile.shop_id,
    role: canonicalRole,
    assetId,
  });
  if (!health) notFound();

  // Setup is secondary to Asset Health. Authorization has already happened
  // through the canonical workspace loader above; a setup-status read failure
  // must not make the asset itself unavailable.
  const { data: installedComponents, error: componentError } = await admin
    .from("equipment_components")
    .select("id")
    .eq("shop_id", profile.shop_id)
    .eq("installed_vehicle_id", assetId)
    .limit(1);
  if (componentError) {
    console.error("[equipment/setup] unable to verify installed components", {
      shopId: profile.shop_id,
      assetId,
      error: componentError,
    });
  }

  const asset = health.equipment.asset;
  const equipmentProfile = health.equipment.profile;
  const meterRecorded =
    asset.engineHours !== null ||
    (asset.odometer !== null && String(asset.odometer).trim() !== "") ||
    equipmentProfile?.currentCycles !== null && equipmentProfile?.currentCycles !== undefined;

  return (
    <>
      <EquipmentSetupChecklist
        assetId={assetId}
        state={{
          meterRecorded,
          componentsConfigured: componentError ? null : Boolean(installedComponents?.length),
          pmConfigured: Boolean(health.pmPlans?.activePlans),
          inspectionRecorded: Boolean(health.evidence.latestInspection),
        }}
      />
      <AssetHealthView
        health={health}
        canOpenComponentHistory={(EQUIPMENT_DIRECTORY_ROLES as readonly string[]).includes(
          canonicalRole,
        )}
      />
    </>
  );
}
