export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import {
  COMPONENT_MANAGER_ROLES,
  isComponentId,
} from "@/features/equipment/lib/components";
import { EquipmentAssetProfileError } from "@/features/equipment/server/equipmentAssetProfileService";
import {
  componentEntitlementFailure,
  componentJson as json,
} from "@/features/equipment/server/equipmentComponentRoutes";
import {
  EquipmentUndercarriageError,
  setWearLimit,
} from "@/features/equipment/server/equipmentUndercarriageService";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ componentId: string }> };

/** Set (version) a wear limit on an undercarriage component. Component managers only. */
export async function PUT(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: COMPONENT_MANAGER_ROLES,
  });
  if (!access.ok) return access.response;

  const { componentId } = await context.params;
  if (!isComponentId(componentId)) return json({ error: "Component not found." }, 404);

  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "A wear limit body is required." }, 400);
  }

  const entitlement = await componentEntitlementFailure(access.profile.shop_id, true);
  if (entitlement) return entitlement;

  try {
    const limit = await setWearLimit({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      actorUserId: access.authUserId,
      componentId,
      body,
    });
    return json({ limit });
  } catch (error) {
    if (error instanceof EquipmentUndercarriageError || error instanceof EquipmentAssetProfileError) {
      return json({ error: error.message }, error.status);
    }
    console.error("[equipment/undercarriage] unexpected failure", error);
    return json({ error: "The wear limit could not be saved." }, 500);
  }
}
