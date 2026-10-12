export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import {
  COMPONENT_WORK_RECORDER_ROLES,
  isComponentId,
} from "@/features/equipment/lib/components";
import { validateMeasurementCorrection } from "@/features/equipment/lib/measurements";
import { EquipmentAssetProfileError } from "@/features/equipment/server/equipmentAssetProfileService";
import {
  componentEntitlementFailure,
  componentJson as json,
} from "@/features/equipment/server/equipmentComponentRoutes";
import {
  correctMeasurement,
  EquipmentMeasurementError,
} from "@/features/equipment/server/equipmentMeasurementService";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ measurementId: string }> };

/**
 * Correct or void a reading. History is append-only: the correction
 * supersedes the reading and keeps the original visible in history.
 */
export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: COMPONENT_WORK_RECORDER_ROLES,
  });
  if (!access.ok) return access.response;

  const { measurementId } = await context.params;
  if (!isComponentId(measurementId)) return json({ error: "Measurement not found." }, 404);

  const body = (await request.json().catch(() => null)) as unknown;
  const validation = validateMeasurementCorrection(body);
  if (!validation.ok) return json({ error: validation.error }, 400);

  const entitlement = await componentEntitlementFailure(access.profile.shop_id, true);
  if (entitlement) return entitlement;

  try {
    const id = await correctMeasurement({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      actorUserId: access.authUserId,
      measurementId,
      correction: validation.value,
    });
    return json({ id }, 201);
  } catch (error) {
    if (error instanceof EquipmentMeasurementError || error instanceof EquipmentAssetProfileError) {
      return json({ error: error.message }, error.status);
    }
    console.error("[equipment/measurements] unexpected failure", error);
    return json({ error: "The correction could not be processed." }, 500);
  }
}
