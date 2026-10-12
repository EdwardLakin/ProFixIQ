export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import {
  canManageComponents,
  COMPONENT_MANAGER_ROLES,
  isComponentId,
  validateComponentFields,
} from "@/features/equipment/lib/components";
import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
import {
  componentEntitlementFailure,
  componentJson as json,
  componentServiceFailure,
} from "@/features/equipment/server/equipmentComponentRoutes";
import {
  loadComponentDetail,
  updateComponent,
} from "@/features/equipment/server/equipmentComponentService";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ componentId: string }> };

/** Cross-machine component history is a shop-wide view (directory roles only). */
export async function GET(_request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({ allowRoles: EQUIPMENT_DIRECTORY_ROLES });
  if (!access.ok) return access.response;

  const { componentId } = await context.params;
  if (!isComponentId(componentId)) return json({ error: "Component not found." }, 404);

  const failure = await componentEntitlementFailure(access.profile.shop_id, false);
  if (failure) return failure;

  try {
    const detail = await loadComponentDetail({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      componentId,
    });
    if (!detail) return json({ error: "Component not found." }, 404);
    return json({ entitled: true, canEdit: canManageComponents(access.canonicalRole), ...detail });
  } catch (error) {
    return componentServiceFailure(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: COMPONENT_MANAGER_ROLES,
  });
  if (!access.ok) return access.response;

  const { componentId } = await context.params;
  if (!isComponentId(componentId)) return json({ error: "Component not found." }, 404);

  const body = (await request.json().catch(() => null)) as unknown;
  const validation = validateComponentFields(body);
  if (!validation.ok) return json({ error: validation.error }, 400);

  const failure = await componentEntitlementFailure(access.profile.shop_id, true);
  if (failure) return failure;

  try {
    await updateComponent({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      actorUserId: access.authUserId,
      componentId,
      fields: validation.value,
    });
    return json({ ok: true });
  } catch (error) {
    return componentServiceFailure(error);
  }
}
