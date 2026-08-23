export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  loadMobileWorkOrderDetail,
  MOBILE_WORK_ORDER_DETAIL_ROLES,
} from "@/features/work-orders/mobile/server/loadMobileWorkOrderDetail";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function detailError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: MOBILE_WORK_ORDER_DETAIL_ROLES,
  });
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const routeId = id.trim();
  if (!routeId) return detailError("Work order not found.", 404);

  try {
    const snapshot = await loadMobileWorkOrderDetail({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      routeId,
    });
    if (!snapshot) return detailError("Work order not found.", 404);

    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[mobile/work-orders/detail] load failed", {
      routeId,
      actorId: access.authUserId,
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return detailError("This work order could not be loaded.", 500);
  }
}
