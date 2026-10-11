export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { resolveEquipmentAddonEntitlementForShop } from "@/features/equipment/server/equipmentAddonEntitlement";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function GET() {
  try {
    const access = await requireShopScopedApiAccess();
    if (!access.ok) return access.response;

    const entitlement = await resolveEquipmentAddonEntitlementForShop(
      access.profile.shop_id,
    );

    return NextResponse.json(
      { enabled: entitlement.enabled },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    console.error("[equipment/entitlement] error", error);
    return NextResponse.json(
      { error: "Equipment entitlement could not be verified." },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
