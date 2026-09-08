import { NextResponse } from "next/server";

import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { searchAppointmentCustomerVehicles } from "@/features/scheduling/server/searchAppointmentCustomerVehicles";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess({
    allowRoles: ROLE_GROUPS.schedulerBookingWriters,
  });
  if (!access.ok) return access.response;

  try {
    const response = await searchAppointmentCustomerVehicles({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      query: new URL(request.url).searchParams.get("q"),
    });
    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[scheduling] appointment customer vehicle search failed", {
      shopId: access.profile.shop_id,
      userId: access.authUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Unable to search customers and vehicles" },
      { status: 500 },
    );
  }
}
