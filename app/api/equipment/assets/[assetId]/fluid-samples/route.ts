export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { isAssetId } from "@/features/equipment/lib/assetProfile";
import {
  canManageComponents,
  canRecordComponentWork,
  COMPONENT_WORK_RECORDER_ROLES,
} from "@/features/equipment/lib/components";
import { EquipmentAssetProfileError } from "@/features/equipment/server/equipmentAssetProfileService";
import {
  componentEntitlementFailure,
  componentJson as json,
} from "@/features/equipment/server/equipmentComponentRoutes";
import {
  EquipmentFluidSampleError,
  loadAssetFluidSamples,
  recordFluidSample,
} from "@/features/equipment/server/equipmentFluidSampleService";
import { readJsonObject } from "@/features/equipment/server/equipmentPmRoutes";
import { VEHICLE_WORKSPACE_READER_ROLES } from "@/features/vehicles/lib/vehicleWorkspace";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ assetId: string }> };

function failure(error: unknown, fallback: string) {
  if (error instanceof EquipmentFluidSampleError || error instanceof EquipmentAssetProfileError) {
    return json({ error: error.message }, error.status);
  }
  console.error("[equipment/fluid-samples] unexpected failure", error);
  return json({ error: fallback }, 500);
}

/** Fluid sample history for an asset (readers; mechanics only on assigned assets). */
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
    const result = await loadAssetFluidSamples({
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
      canVoid: canManageComponents(access.canonicalRole),
      ...result,
    });
  } catch (error) {
    return failure(error, "Fluid samples could not be loaded.");
  }
}

/** Record a lab fluid sample with its results (managers and mechanics). */
export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: COMPONENT_WORK_RECORDER_ROLES,
  });
  if (!access.ok) return access.response;

  const { assetId } = await context.params;
  if (!isAssetId(assetId)) return json({ error: "Asset not found." }, 404);

  const body = await readJsonObject(request);
  if (!body) return json({ error: "A fluid sample is required." }, 400);

  const entitlement = await componentEntitlementFailure(access.profile.shop_id, true);
  if (entitlement) return entitlement;

  try {
    const sample = await recordFluidSample({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      actorUserId: access.authUserId,
      assetId,
      body,
    });
    return json({ sample }, 201);
  } catch (error) {
    return failure(error, "The fluid sample could not be recorded.");
  }
}
