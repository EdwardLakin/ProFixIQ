import { NextRequest, NextResponse } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  fieldInventoryErrorResponse,
  fieldInventoryRpc,
  isUuid,
} from "./_lib";

export async function GET(request: NextRequest) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const visitId = request.nextUrl.searchParams.get("visitId")?.trim() || null;
  const serviceVehicleId =
    request.nextUrl.searchParams.get("serviceVehicleId")?.trim() || null;
  const query = request.nextUrl.searchParams.get("query")?.trim() || null;
  if (visitId && !isUuid(visitId)) {
    return NextResponse.json({ error: "Invalid service visit." }, { status: 400 });
  }
  if (serviceVehicleId && !isUuid(serviceVehicleId)) {
    return NextResponse.json({ error: "Invalid service truck." }, { status: 400 });
  }
  if (query && query.length > 120) {
    return NextResponse.json({ error: "Search is too long." }, { status: 400 });
  }

  const { data, error } = await fieldInventoryRpc(
    access.supabase,
    "field_truck_inventory_snapshot",
    {
      p_shop_id: access.profile.shop_id,
      p_actor_user_id: access.authUserId,
      p_service_visit_id: visitId,
      p_service_vehicle_id: serviceVehicleId,
      p_query: query,
    },
  );
  if (error) return fieldInventoryErrorResponse(error, "field-truck-inventory/snapshot");

  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
