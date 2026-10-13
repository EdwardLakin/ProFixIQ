export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { isAssetId } from "@/features/equipment/lib/assetProfile";
import { COMPONENT_MANAGER_ROLES } from "@/features/equipment/lib/components";
import { EquipmentAssetProfileError } from "@/features/equipment/server/equipmentAssetProfileService";
import {
  componentEntitlementFailure,
  componentJson as json,
} from "@/features/equipment/server/equipmentComponentRoutes";
import {
  EquipmentFluidSampleError,
  voidFluidSample,
} from "@/features/equipment/server/equipmentFluidSampleService";
import { readJsonObject } from "@/features/equipment/server/equipmentPmRoutes";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ sampleId: string }> };

/** Void a mistaken fluid sample with a reason. Component managers only. */
export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: COMPONENT_MANAGER_ROLES,
  });
  if (!access.ok) return access.response;

  const { sampleId } = await context.params;
  if (!isAssetId(sampleId)) return json({ error: "Sample not found." }, 404);

  const body = await readJsonObject(request);
  if (!body) return json({ error: "A reason is required." }, 400);

  const entitlement = await componentEntitlementFailure(access.profile.shop_id, true);
  if (entitlement) return entitlement;

  try {
    const sample = await voidFluidSample({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      actorUserId: access.authUserId,
      sampleId,
      body,
    });
    return json({ sample });
  } catch (error) {
    if (error instanceof EquipmentFluidSampleError || error instanceof EquipmentAssetProfileError) {
      return json({ error: error.message }, error.status);
    }
    console.error("[equipment/fluid-samples] unexpected failure", error);
    return json({ error: "The sample could not be voided." }, 500);
  }
}
