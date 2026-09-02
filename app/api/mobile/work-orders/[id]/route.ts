export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { resolveWorkOrderProductAuthority } from "@/features/mobile/service/server/access";
import { SHOP_OR_FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  loadMobileWorkOrderDetail,
  MOBILE_WORK_ORDER_DETAIL_ROLES,
} from "@/features/work-orders/mobile/server/loadMobileWorkOrderDetail";
import { resolveVisibleWorkOrderId } from "@/features/work-orders/workspace/server/loadWorkOrderWorkspaceSnapshot";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function detailError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: MOBILE_WORK_ORDER_DETAIL_ROLES,
    requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  });
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const routeId = id.trim();
  if (!routeId) return detailError("Work order not found.", 404);

  try {
    const canonicalWorkOrderId = await resolveVisibleWorkOrderId({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      routeId,
    });
    if (!canonicalWorkOrderId) {
      return detailError("Work order not found.", 404);
    }

    const authority = await resolveWorkOrderProductAuthority(
      access,
      canonicalWorkOrderId,
    );
    if (!authority.authorized) {
      return detailError("Work order not found.", 404);
    }

    const snapshot = await loadMobileWorkOrderDetail({
      supabase: access.supabase,
      dataSupabase: createAdminSupabase(),
      profileId: access.profile.id,
      shopId: access.profile.shop_id,
      routeId,
    });
    if (!snapshot) return detailError("Work order not found.", 404);

    return NextResponse.json(
      { ...snapshot, productScope: authority.product },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
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
