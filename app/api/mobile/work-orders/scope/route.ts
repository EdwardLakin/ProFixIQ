export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { listFieldOperatorAssignedWorkOrderIds } from "@/features/mobile/service/server/access";
import {
  resolveShopProductAccess,
  SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  SHOP_PRODUCT_CAPABILITIES,
} from "@/features/shared/lib/product-access";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { MOBILE_WORK_ORDER_DETAIL_ROLES } from "@/features/work-orders/mobile/server/loadMobileWorkOrderDetail";

export async function GET() {
  const access = await requireShopScopedApiAccess({
    allowRoles: MOBILE_WORK_ORDER_DETAIL_ROLES,
    requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  });
  if (!access.ok) return access.response;

  const shopAccess = await resolveShopProductAccess({
    supabase: access.supabase,
    shopId: access.profile.shop_id,
    capabilities: SHOP_PRODUCT_CAPABILITIES,
  });
  if (shopAccess.entitled) {
    return NextResponse.json(
      { scope: "shop", workOrderIds: null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const workOrderIds = await listFieldOperatorAssignedWorkOrderIds(access);
    return NextResponse.json(
      { scope: "field", workOrderIds },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to resolve the Field work-order scope." },
      { status: 503 },
    );
  }
}
