export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { isAssetId } from "@/features/equipment/lib/assetProfile";
import { COMPONENT_MANAGER_ROLES } from "@/features/equipment/lib/components";
import {
  componentEntitlementFailure,
  componentJson as json,
} from "@/features/equipment/server/equipmentComponentRoutes";
import { voidPmCompletion } from "@/features/equipment/server/equipmentPmService";
import { pmServiceFailure, readJsonObject } from "@/features/equipment/server/equipmentPmRoutes";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ completionId: string }> };

/** Void a mistaken PM completion with a reason. Component managers only. */
export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: COMPONENT_MANAGER_ROLES,
  });
  if (!access.ok) return access.response;

  const { completionId } = await context.params;
  if (!isAssetId(completionId)) return json({ error: "Completion not found." }, 404);

  const body = await readJsonObject(request);
  if (!body) return json({ error: "A reason is required." }, 400);

  const entitlement = await componentEntitlementFailure(access.profile.shop_id, true);
  if (entitlement) return entitlement;

  try {
    const completion = await voidPmCompletion({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      actorUserId: access.authUserId,
      completionId,
      body,
    });
    return json({ completion });
  } catch (error) {
    return pmServiceFailure(error, "The completion could not be voided.");
  }
}
