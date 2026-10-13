export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { isAssetId } from "@/features/equipment/lib/assetProfile";
import {
  canManageComponents,
  canRecordComponentWork,
  COMPONENT_MANAGER_ROLES,
} from "@/features/equipment/lib/components";
import {
  componentEntitlementFailure,
  componentJson as json,
} from "@/features/equipment/server/equipmentComponentRoutes";
import { loadAssetPm, savePmPlan } from "@/features/equipment/server/equipmentPmService";
import { pmServiceFailure, readJsonObject } from "@/features/equipment/server/equipmentPmRoutes";
import { VEHICLE_WORKSPACE_READER_ROLES } from "@/features/vehicles/lib/vehicleWorkspace";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ assetId: string }> };

/** PM plans and their due status for an asset (readers; mechanics only on assigned assets). */
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
    const result = await loadAssetPm({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      assetId,
    });
    if (!result) return json({ error: "Asset not found." }, 404);
    return json({
      entitled: true,
      canManage: canManageComponents(access.canonicalRole),
      canRecord: canRecordComponentWork(access.canonicalRole),
      ...result,
    });
  } catch (error) {
    return pmServiceFailure(error, "PM plans could not be loaded.");
  }
}

/** Create a PM plan on an asset. Component managers only. */
export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: COMPONENT_MANAGER_ROLES,
  });
  if (!access.ok) return access.response;

  const { assetId } = await context.params;
  if (!isAssetId(assetId)) return json({ error: "Asset not found." }, 404);

  const body = await readJsonObject(request);
  if (!body) return json({ error: "A PM plan is required." }, 400);

  const entitlement = await componentEntitlementFailure(access.profile.shop_id, true);
  if (entitlement) return entitlement;

  try {
    const plan = await savePmPlan({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      actorUserId: access.authUserId,
      assetId,
      planId: null,
      body,
    });
    return json({ plan }, 201);
  } catch (error) {
    return pmServiceFailure(error, "The PM plan could not be saved.");
  }
}
