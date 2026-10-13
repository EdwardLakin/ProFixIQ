export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { isAssetId } from "@/features/equipment/lib/assetProfile";
import { COMPONENT_WORK_RECORDER_ROLES } from "@/features/equipment/lib/components";
import {
  componentEntitlementFailure,
  componentJson as json,
} from "@/features/equipment/server/equipmentComponentRoutes";
import { pmServiceFailure, readJsonObject } from "@/features/equipment/server/equipmentPmRoutes";
import { linkPmWorkOrder } from "@/features/equipment/server/equipmentPmWorkOrderService";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ planId: string }> };

/** Link one of the asset's work orders to a PM plan (managers and mechanics; mechanics only on assigned assets). */
export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: COMPONENT_WORK_RECORDER_ROLES,
  });
  if (!access.ok) return access.response;

  const { planId } = await context.params;
  if (!isAssetId(planId)) return json({ error: "PM plan not found." }, 404);

  const body = await readJsonObject(request);
  if (!body) return json({ error: "A work order is required." }, 400);

  const entitlement = await componentEntitlementFailure(access.profile.shop_id, true);
  if (entitlement) return entitlement;

  try {
    const link = await linkPmWorkOrder({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      actorUserId: access.authUserId,
      planId,
      body,
    });
    return json({ link }, 201);
  } catch (error) {
    return pmServiceFailure(error, "The work order could not be linked.");
  }
}
