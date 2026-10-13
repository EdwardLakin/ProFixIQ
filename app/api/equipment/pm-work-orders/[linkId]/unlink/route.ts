export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { isAssetId } from "@/features/equipment/lib/assetProfile";
import { COMPONENT_MANAGER_ROLES } from "@/features/equipment/lib/components";
import {
  componentEntitlementFailure,
  componentJson as json,
} from "@/features/equipment/server/equipmentComponentRoutes";
import { pmServiceFailure, readJsonObject } from "@/features/equipment/server/equipmentPmRoutes";
import { unlinkPmWorkOrder } from "@/features/equipment/server/equipmentPmWorkOrderService";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ linkId: string }> };

/** Unlink a mistakenly linked PM work order (kept in history). Component managers only. */
export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: COMPONENT_MANAGER_ROLES,
  });
  if (!access.ok) return access.response;

  const { linkId } = await context.params;
  if (!isAssetId(linkId)) return json({ error: "Work order link not found." }, 404);

  const body = await readJsonObject(request);
  if (!body) return json({ error: "An operation key is required." }, 400);

  const entitlement = await componentEntitlementFailure(access.profile.shop_id, true);
  if (entitlement) return entitlement;

  try {
    const link = await unlinkPmWorkOrder({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      actorUserId: access.authUserId,
      linkId,
      body,
    });
    return json({ link });
  } catch (error) {
    return pmServiceFailure(error, "The work order could not be unlinked.");
  }
}
