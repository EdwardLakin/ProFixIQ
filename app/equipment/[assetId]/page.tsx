import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import AssetHealthView from "@/features/equipment/components/AssetHealthView";
import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import EquipmentSetupChecklist from "@/features/equipment/components/EquipmentSetupChecklist";
import EquipmentWorkOrderActions from "@/features/equipment/components/EquipmentWorkOrderActions";
import { isAssetId } from "@/features/equipment/lib/assetProfile";
import {
  canManageComponents,
  componentTemplateForClass,
} from "@/features/equipment/lib/components";
import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
import { loadAssetHealth } from "@/features/equipment/server/loadAssetHealth";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import { VEHICLE_WORKSPACE_READER_ROLES } from "@/features/vehicles/lib/vehicleWorkspace";
import { vehicleWorkspaceCreateWorkOrderHref } from "@/features/vehicles/server/loadVehicleWorkspaceSnapshot";
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

  const canManageSetup = canManageComponents(canonicalRole);
  const equipmentProfile = health.equipment.profile;
  const componentTemplateRequired = Boolean(
    equipmentProfile && componentTemplateForClass(equipmentProfile.equipmentClass).length,
  );

  // Setup verification is secondary to Asset Health. Authorization has already
  // happened through the canonical workspace loader above; read failures here
  // must not make the asset itself unavailable or falsely mark a step complete.
  const [componentsResult, meterHistoryResult] = canManageSetup
    ? await Promise.all([
        componentTemplateRequired
          ? admin
              .from("equipment_components")
              .select("id")
              .eq("shop_id", profile.shop_id)
              .eq("installed_vehicle_id", assetId)
              .limit(1)
          : Promise.resolve({ data: [], error: null }),
        equipmentProfile?.primaryMeter === "none"
          ? Promise.resolve({ data: [], error: null })
          : admin
              .from("equipment_meter_readings")
              .select("id")
              .eq("shop_id", profile.shop_id)
              .eq("vehicle_id", assetId)
              .is("voided_at", null)
              .limit(1),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];

  if (componentsResult.error) {
    console.error("[equipment/setup] unable to verify installed components", {
      shopId: profile.shop_id,
      assetId,
      error: componentsResult.error,
    });
  }
  if (meterHistoryResult.error) {
    console.error("[equipment/setup] unable to verify meter history", {
      shopId: profile.shop_id,
      assetId,
      error: meterHistoryResult.error,
    });
  }

  const asset = health.equipment.asset;
  const hasCanonicalMeter =
    asset.engineHours !== null ||
    (asset.odometer !== null && String(asset.odometer).trim() !== "") ||
    (equipmentProfile?.currentCycles !== null && equipmentProfile?.currentCycles !== undefined);
  const meterNotApplicable = equipmentProfile?.primaryMeter === "none";
  const meterRecorded = meterNotApplicable || hasCanonicalMeter
    ? true
    : meterHistoryResult.error
      ? null
      : Boolean(meterHistoryResult.data?.length);
  const componentsConfigured = !componentTemplateRequired
    ? true
    : componentsResult.error
      ? null
      : Boolean(componentsResult.data?.length);

  return (
    <>
      {canManageSetup ? (
        <EquipmentSetupChecklist
          state={{
            meterRecorded,
            componentsConfigured,
            pmConfigured: Boolean(health.pmPlans?.activePlans),
            inspectionRecorded: Boolean(health.evidence.latestInspection),
          }}
        />
      ) : null}
      <EquipmentWorkOrderActions
        createWorkOrderHref={vehicleWorkspaceCreateWorkOrderHref(health.snapshot)}
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
