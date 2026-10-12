export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { isComponentId, validateComponentAction } from "@/features/equipment/lib/components";
import {
  componentEntitlementFailure,
  componentJson as json,
  componentServiceFailure,
  EQUIPMENT_COMPONENT_WRITER_ROLES,
} from "@/features/equipment/server/equipmentComponentRoutes";
import { applyComponentAction } from "@/features/equipment/server/equipmentComponentService";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ componentId: string }> };

/** Install, remove, rebuild, repair, inspect or scrap a component. */
export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: EQUIPMENT_COMPONENT_WRITER_ROLES,
  });
  if (!access.ok) return access.response;

  const { componentId } = await context.params;
  if (!isComponentId(componentId)) return json({ error: "Component not found." }, 404);

  const body = (await request.json().catch(() => null)) as unknown;
  const validation = validateComponentAction(body);
  if (!validation.ok) return json({ error: validation.error }, 400);

  const failure = await componentEntitlementFailure(access.profile.shop_id, true);
  if (failure) return failure;

  try {
    await applyComponentAction({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      actorUserId: access.authUserId,
      componentId,
      input: validation.value,
    });
    return json({ ok: true });
  } catch (error) {
    return componentServiceFailure(error);
  }
}
