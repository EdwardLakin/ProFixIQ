import { NextResponse } from "next/server";

import {
  requireShopScopedApiAccess,
} from "@/features/shared/lib/server/admin-access";
import { VEHICLE_WORKSPACE_READER_ROLES } from "@/features/vehicles/lib/vehicleWorkspace";
import { searchShopVehicleRecords } from "@/features/vehicles/server/searchShopVehicleRecords";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess({
    allowRoles: VEHICLE_WORKSPACE_READER_ROLES,
  });
  if (!access.ok) return access.response;

  try {
    const response = await searchShopVehicleRecords({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      query: new URL(request.url).searchParams.get("q"),
    });
    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[vehicle-workspace] vehicle search failed", {
      shopId: access.profile.shop_id,
      userId: access.authUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Unable to search vehicle records" },
      { status: 500 },
    );
  }
}
