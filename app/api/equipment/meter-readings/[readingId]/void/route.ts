export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { isAssetId } from "@/features/equipment/lib/assetProfile";
import { COMPONENT_MANAGER_ROLES } from "@/features/equipment/lib/components";
import {
  componentEntitlementFailure,
  componentJson as json,
} from "@/features/equipment/server/equipmentComponentRoutes";
import { meterServiceFailure } from "@/features/equipment/server/equipmentMeterRoutes";
import { voidMeterReading } from "@/features/equipment/server/equipmentMeterService";
import { readJsonObject } from "@/features/equipment/server/equipmentPmRoutes";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ readingId: string }> };

/** Void a mistaken meter reading with a reason. Component managers only. */
export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: COMPONENT_MANAGER_ROLES,
  });
  if (!access.ok) return access.response;

  const { readingId } = await context.params;
  if (!isAssetId(readingId)) return json({ error: "Reading not found." }, 404);

  const body = await readJsonObject(request);
  if (!body) return json({ error: "A reason is required." }, 400);

  const entitlement = await componentEntitlementFailure(access.profile.shop_id, true);
  if (entitlement) return entitlement;

  try {
    const reading = await voidMeterReading({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      actorUserId: access.authUserId,
      readingId,
      body,
    });
    return json({ reading });
  } catch (error) {
    return meterServiceFailure(error, "The reading could not be voided.");
  }
}
