export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { isAssetId } from "@/features/equipment/lib/assetProfile";
import {
  canManageComponents,
  canRecordComponentWork,
} from "@/features/equipment/lib/components";
import { EquipmentAssetProfileError } from "@/features/equipment/server/equipmentAssetProfileService";
import {
  componentEntitlementFailure,
  componentJson as json,
} from "@/features/equipment/server/equipmentComponentRoutes";
import { EquipmentMeasurementError } from "@/features/equipment/server/equipmentMeasurementService";
import {
  EquipmentUndercarriageError,
  loadUndercarriage,
} from "@/features/equipment/server/equipmentUndercarriageService";
import { VEHICLE_WORKSPACE_READER_ROLES } from "@/features/vehicles/lib/vehicleWorkspace";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ assetId: string }> };

/** Undercarriage wear for an asset (readers; mechanics only on assigned assets). */
export async function GET(_request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: VEHICLE_WORKSPACE_READER_ROLES,
  });
  if (!access.ok) return access.response;

  const { assetId } = await context.params;
  if (!isAssetId(assetId)) return json({ error: "Asset not found." }, 404);

  const entitlement = await componentEntitlementFailure(access.profile.shop_id, false);
  if (entitlement) return entitlement;

  try {
    const result = await loadUndercarriage({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      assetId,
    });
    if (!result) return json({ error: "Asset not found." }, 404);
    return json({
      entitled: true,
      canRecord: canRecordComponentWork(access.canonicalRole),
      canSetLimits: canManageComponents(access.canonicalRole),
      ...result,
    });
  } catch (error) {
    if (
      error instanceof EquipmentUndercarriageError ||
      error instanceof EquipmentMeasurementError ||
      error instanceof EquipmentAssetProfileError
    ) {
      return json({ error: error.message }, error.status);
    }
    console.error("[equipment/undercarriage] unexpected failure", error);
    return json({ error: "The undercarriage could not be loaded." }, 500);
  }
}
