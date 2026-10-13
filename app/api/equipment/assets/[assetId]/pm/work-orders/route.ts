export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { isAssetId } from "@/features/equipment/lib/assetProfile";
import {
  componentEntitlementFailure,
  componentJson as json,
} from "@/features/equipment/server/equipmentComponentRoutes";
import { pmServiceFailure } from "@/features/equipment/server/equipmentPmRoutes";
import { loadAssetPmWorkOrders } from "@/features/equipment/server/equipmentPmWorkOrderService";
import { VEHICLE_WORKSPACE_READER_ROLES } from "@/features/vehicles/lib/vehicleWorkspace";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ assetId: string }> };

/** Work orders linked to an asset's PM plans (readers; mechanics only on assigned assets). */
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
    const result = await loadAssetPmWorkOrders({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      assetId,
    });
    if (!result) return json({ error: "Asset not found." }, 404);
    return json({ entitled: true, ...result });
  } catch (error) {
    return pmServiceFailure(error, "PM work orders could not be loaded.");
  }
}
