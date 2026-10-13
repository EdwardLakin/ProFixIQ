export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { isAssetId } from "@/features/equipment/lib/assetProfile";
import { COMPONENT_MANAGER_ROLES } from "@/features/equipment/lib/components";
import {
  componentEntitlementFailure,
  componentJson as json,
} from "@/features/equipment/server/equipmentComponentRoutes";
import { savePmPlan } from "@/features/equipment/server/equipmentPmService";
import { pmServiceFailure, readJsonObject } from "@/features/equipment/server/equipmentPmRoutes";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ planId: string }> };

/** Update (or archive/restore) a PM plan with the version the editor loaded. Component managers only. */
export async function PUT(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: COMPONENT_MANAGER_ROLES,
  });
  if (!access.ok) return access.response;

  const { planId } = await context.params;
  if (!isAssetId(planId)) return json({ error: "PM plan not found." }, 404);

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
      assetId: null,
      planId,
      body,
    });
    return json({ plan });
  } catch (error) {
    return pmServiceFailure(error, "The PM plan could not be saved.");
  }
}
