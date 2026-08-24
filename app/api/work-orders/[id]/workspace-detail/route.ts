export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { loadRoleShapedWorkOrderDetail } from "@/features/work-orders/workspace/server/loadRoleShapedWorkOrderDetail";
import { WORK_ORDER_WORKSPACE_READER_ROLES } from "@/features/work-orders/workspace/server/loadWorkOrderWorkspaceSnapshot";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    allowRoles: WORK_ORDER_WORKSPACE_READER_ROLES,
  });
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const routeId = id.trim();
  if (!routeId) {
    return NextResponse.json(
      { error: "Work order not found." },
      { status: 404 },
    );
  }

  try {
    const snapshot = await loadRoleShapedWorkOrderDetail({
      authorizationSupabase: access.supabase,
      dataSupabase: createAdminSupabase(),
      profileId: access.profile.id,
      shopId: access.profile.shop_id,
      routeId,
    });
    if (!snapshot) {
      return NextResponse.json(
        { error: "Work order not found." },
        { status: 404 },
      );
    }

    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[work-orders/workspace-detail] load failed", {
      routeId,
      actorId: access.authUserId,
      shopId: access.profile.shop_id,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "This work order could not be loaded." },
      { status: 500 },
    );
  }
}
