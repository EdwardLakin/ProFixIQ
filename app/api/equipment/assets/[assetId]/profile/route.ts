export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  isAssetId,
  validateEquipmentAssetProfileMutation,
} from "@/features/equipment/lib/assetProfile";
import { resolveEquipmentAddonEntitlementForShop } from "@/features/equipment/server/equipmentAddonEntitlement";
import {
  EquipmentAssetProfileError,
  loadEquipmentAssetRecord,
  saveEquipmentAssetProfile,
} from "@/features/equipment/server/equipmentAssetProfileService";
import { VEHICLE_WORKSPACE_READER_ROLES } from "@/features/vehicles/lib/vehicleWorkspace";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

const NO_STORE = { "Cache-Control": "private, no-store" };

type RouteContext = { params: Promise<{ assetId: string }> };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** null = entitled; otherwise the response to return. */
async function entitlementFailure(shopId: string, forWrite: boolean) {
  try {
    const entitlement = await resolveEquipmentAddonEntitlementForShop(shopId);
    if (entitlement.enabled) return null;
    // Reads report a non-entitled shop as a normal state so the UI can stay
    // quiet; writes are refused.
    return forWrite
      ? json({ error: "An active Equipment subscription is required." }, 403)
      : json({ entitled: false });
  } catch (error) {
    console.error("[equipment/asset-profile] entitlement failed", { shopId, error });
    return json({ error: "Equipment entitlement could not be verified. Try again." }, 503);
  }
}

function serviceFailure(error: unknown) {
  if (error instanceof EquipmentAssetProfileError) {
    return json({ error: error.message }, error.status);
  }
  console.error("[equipment/asset-profile] unexpected failure", error);
  return json({ error: "The Equipment profile could not be processed." }, 500);
}

export async function GET(_request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: VEHICLE_WORKSPACE_READER_ROLES,
  });
  if (!access.ok) return access.response;

  const { assetId } = await context.params;
  if (!isAssetId(assetId)) return json({ error: "Asset not found." }, 404);

  const failure = await entitlementFailure(access.profile.shop_id, false);
  if (failure) return failure;

  try {
    const record = await loadEquipmentAssetRecord({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      assetId,
    });
    if (!record) return json({ error: "Asset not found." }, 404);
    return json({
      entitled: true,
      canEdit: (ROLE_GROUPS.billingOperators as readonly string[]).includes(
        access.canonicalRole,
      ),
      ...record,
    });
  } catch (error) {
    return serviceFailure(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: ROLE_GROUPS.billingOperators,
  });
  if (!access.ok) return access.response;

  const { assetId } = await context.params;
  if (!isAssetId(assetId)) return json({ error: "Asset not found." }, 404);

  const body = (await request.json().catch(() => null)) as unknown;
  const validation = validateEquipmentAssetProfileMutation(body, assetId);
  if (!validation.ok) return json({ error: validation.error }, 400);

  const failure = await entitlementFailure(access.profile.shop_id, true);
  if (failure) return failure;

  try {
    const record = await saveEquipmentAssetProfile({
      supabase: access.supabase,
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      actorUserId: access.authUserId,
      assetId,
      mutation: validation.value,
    });
    return json({ entitled: true, canEdit: true, ...record });
  } catch (error) {
    return serviceFailure(error);
  }
}
