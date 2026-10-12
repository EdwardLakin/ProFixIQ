export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { isAssetId } from "@/features/equipment/lib/assetProfile";
import {
  canRecordComponentWork,
  COMPONENT_WORK_RECORDER_ROLES,
} from "@/features/equipment/lib/components";
import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
import { validateMeasurementBatch } from "@/features/equipment/lib/measurements";
import { EquipmentAssetProfileError } from "@/features/equipment/server/equipmentAssetProfileService";
import {
  componentEntitlementFailure,
  componentJson as json,
} from "@/features/equipment/server/equipmentComponentRoutes";
import {
  EquipmentMeasurementError,
  loadAssetMeasurements,
  recordMeasurements,
} from "@/features/equipment/server/equipmentMeasurementService";
import { VEHICLE_WORKSPACE_READER_ROLES } from "@/features/vehicles/lib/vehicleWorkspace";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ assetId: string }> };

function failure(error: unknown) {
  if (error instanceof EquipmentMeasurementError || error instanceof EquipmentAssetProfileError) {
    return json({ error: error.message }, error.status);
  }
  console.error("[equipment/measurements] unexpected failure", error);
  return json({ error: "The measurement request could not be processed." }, 500);
}

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
    const result = await loadAssetMeasurements({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      assetId,
    });
    if (!result) return json({ error: "Asset not found." }, 404);
    return json({
      entitled: true,
      // Reaching here means the asset is visible (assignment rule applied).
      canRecord: canRecordComponentWork(access.canonicalRole),
      // Work-order / inspection links are offered to shop-wide roles; the
      // target pages enforce their own access either way.
      canOpenSources: (EQUIPMENT_DIRECTORY_ROLES as readonly string[]).includes(access.canonicalRole),
      ...result,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: COMPONENT_WORK_RECORDER_ROLES,
  });
  if (!access.ok) return access.response;

  const { assetId } = await context.params;
  if (!isAssetId(assetId)) return json({ error: "Asset not found." }, 404);

  const body = (await request.json().catch(() => null)) as unknown;
  const validation = validateMeasurementBatch(body);
  if (!validation.ok) return json({ error: validation.error }, 400);

  const entitlement = await componentEntitlementFailure(access.profile.shop_id, true);
  if (entitlement) return entitlement;

  try {
    const ids = await recordMeasurements({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      actorUserId: access.authUserId,
      assetId,
      batch: validation.value,
    });
    return json({ ids }, 201);
  } catch (error) {
    return failure(error);
  }
}
