export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { isAssetId } from "@/features/equipment/lib/assetProfile";
import {
  canManageComponents,
  canRecordComponentWork,
  COMPONENT_MANAGER_ROLES,
  isComponentId,
  isOperationKey,
  validateComponentFields,
} from "@/features/equipment/lib/components";
import {
  componentEntitlementFailure,
  componentJson as json,
  componentServiceFailure,
} from "@/features/equipment/server/equipmentComponentRoutes";
import {
  createComponent,
  loadAssetComponents,
  seedStandardComponents,
} from "@/features/equipment/server/equipmentComponentService";
import { VEHICLE_WORKSPACE_READER_ROLES } from "@/features/vehicles/lib/vehicleWorkspace";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ assetId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: VEHICLE_WORKSPACE_READER_ROLES,
  });
  if (!access.ok) return access.response;

  const { assetId } = await context.params;
  if (!isAssetId(assetId)) return json({ error: "Asset not found." }, 404);

  const failure = await componentEntitlementFailure(access.profile.shop_id, false);
  if (failure) return failure;

  try {
    const result = await loadAssetComponents({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      assetId,
    });
    if (!result) return json({ error: "Asset not found." }, 404);
    return json({
      entitled: true,
      canEdit: canManageComponents(access.canonicalRole),
      // Reaching here means the asset is visible (assignment rule applied).
      canRecordWork: canRecordComponentWork(access.canonicalRole),
      ...result,
    });
  } catch (error) {
    return componentServiceFailure(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: COMPONENT_MANAGER_ROLES,
  });
  if (!access.ok) return access.response;

  const { assetId } = await context.params;
  if (!isAssetId(assetId)) return json({ error: "Asset not found." }, 404);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "A component body is required." }, 400);
  }

  const seed = body.seed === true;
  let fields = null;
  if (!seed) {
    const validation = validateComponentFields(body);
    if (!validation.ok) return json({ error: validation.error }, 400);
    fields = validation.value;
  }
  const parentComponentId = body.parentComponentId ?? null;
  if (parentComponentId !== null && !isComponentId(parentComponentId)) {
    return json({ error: "Parent component is invalid." }, 400);
  }
  if (!seed && !isOperationKey(body.operationKey)) {
    return json({ error: "An operation key is required." }, 400);
  }

  const failure = await componentEntitlementFailure(access.profile.shop_id, true);
  if (failure) return failure;

  const writeContext = {
    supabase: access.supabase,
    admin: createAdminSupabase(),
    shopId: access.profile.shop_id,
    role: access.canonicalRole,
    actorUserId: access.authUserId,
  };
  try {
    if (!fields) {
      const created = await seedStandardComponents({ ...writeContext, assetId });
      return json({ created });
    }
    const id = await createComponent({
      ...writeContext,
      fields,
      install: { assetId, parentComponentId },
      operationKey: body.operationKey as string,
    });
    return json({ id }, 201);
  } catch (error) {
    return componentServiceFailure(error);
  }
}
