export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
import { resolveEquipmentAddonEntitlementForShop } from "@/features/equipment/server/equipmentAddonEntitlement";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { getMobileFieldServiceAccess } from "@/features/mobile/service/server/access";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { WorkspaceEntitlementsPayload } from "@/features/shared/lib/workspaceProducts";

const INTERNAL_DEMO_ENTITLEMENT = "internal_demo";

export async function GET() {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  const admin = createAdminSupabase();

  const [shopRow, shopAccess, fieldAccess, fleetAccess] = await Promise.all([
    admin
      .from("shops")
      .select("subscription_package,billing_entitlement_override")
      .eq("id", shopId)
      .maybeSingle<{
        subscription_package: string | null;
        billing_entitlement_override: string | null;
      }>(),
    access.supabase.rpc("profixiq_shop_has_product_access", {
      p_capability: "shop",
      p_shop_id: shopId,
    }),
    access.supabase.rpc("profixiq_shop_has_product_access", {
      p_capability: "field_service",
      p_shop_id: shopId,
    }),
    access.supabase.rpc("profixiq_shop_has_product_access", {
      p_capability: "fleet_maintenance",
      p_shop_id: shopId,
    }),
  ]);

  const error =
    shopRow.error || shopAccess.error || fieldAccess.error || fleetAccess.error;
  if (error) {
    return NextResponse.json(
      { error: "Workspace access could not be resolved." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const internalDemo =
    shopRow.data?.billing_entitlement_override === INTERNAL_DEMO_ENTITLEMENT;

  const [fieldActorAccess, fleetActorAccess] = internalDemo
    ? [true, true]
    : await Promise.all([
        getMobileFieldServiceAccess(access)
          .then((result) => result.canAccessFieldService)
          .catch(() => false),
        resolveFleetActorContext(access.supabase, {
          userId: access.authUserId,
          profileId: access.profile.id,
        })
          .then((result) => result.capabilities.canAccessFleetIntake)
          .catch(() => false),
      ]);

  let equipmentEntitled = internalDemo;
  if (!internalDemo) {
    try {
      equipmentEntitled = (
        await resolveEquipmentAddonEntitlementForShop(shopId)
      ).enabled;
    } catch {
      // Product switching is supplemental navigation. Fail closed for the
      // premium Equipment workspace while keeping the other products usable.
      equipmentEntitled = false;
    }
  }

  // Portal-only accounts (e.g. Fleet invitees) keep a shop-scoped profile but
  // middleware bounces them off the staff surfaces, so Shop/Field/Equipment
  // must not advertise as open for them.
  const {
    data: { user: authUser },
  } = await access.supabase.auth.getUser();
  const portalOnly = authUser?.app_metadata?.profixiq_portal_only === true;
  const equipmentRoleAllowed = (
    EQUIPMENT_DIRECTORY_ROLES as readonly string[]
  ).includes(access.canonicalRole);

  const shopEntitled = internalDemo || shopAccess.data === true;
  const fieldEntitled = internalDemo || fieldAccess.data === true;
  const fleetEntitled = internalDemo || fleetAccess.data === true;

  const payload: WorkspaceEntitlementsPayload = {
    packageKey: internalDemo
      ? "complete_operations"
      : (shopRow.data?.subscription_package ?? null),
    internalDemo,
    workspaces: {
      shop: {
        entitled: shopEntitled,
        accessible: shopEntitled && !portalOnly,
      },
      field: {
        entitled: fieldEntitled,
        accessible:
          !portalOnly && (internalDemo || (fieldEntitled && fieldActorAccess)),
      },
      fleet: {
        entitled: fleetEntitled,
        accessible: internalDemo || (fleetEntitled && fleetActorAccess),
      },
      equipment: {
        entitled: equipmentEntitled,
        accessible: !portalOnly && equipmentEntitled && equipmentRoleAllowed,
      },
    },
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
