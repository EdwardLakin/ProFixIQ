export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { resolveEquipmentAddonEntitlementForShop } from "@/features/equipment/server/equipmentAddonEntitlement";
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

  const payload: WorkspaceEntitlementsPayload = {
    packageKey: internalDemo
      ? "complete_operations"
      : (shopRow.data?.subscription_package ?? null),
    internalDemo,
    workspaces: {
      shop: { entitled: internalDemo || shopAccess.data === true },
      field: { entitled: internalDemo || fieldAccess.data === true },
      fleet: { entitled: internalDemo || fleetAccess.data === true },
      equipment: { entitled: equipmentEntitled },
    },
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
