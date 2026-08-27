export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { resolveWorkOrderProductAuthority } from "@/features/mobile/service/server/access";
import { SHOP_OR_FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
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
    requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  });
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const lineId = id.trim();
  if (!lineId) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const admin = createAdminSupabase();
  const { data: line, error: lineError } = await admin
    .from("work_order_lines")
    .select("id, work_order_id, shop_id")
    .eq("id", lineId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle<{
      id: string;
      work_order_id: string;
      shop_id: string;
    }>();
  if (lineError) {
    return NextResponse.json({ error: lineError.message }, { status: 500 });
  }
  if (!line) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  try {
    const authority = await resolveWorkOrderProductAuthority(
      access,
      line.work_order_id,
    );
    if (!authority.authorized) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const snapshot = await loadRoleShapedWorkOrderDetail({
      authorizationSupabase: access.supabase,
      dataSupabase: admin,
      profileId: access.profile.id,
      shopId: access.profile.shop_id,
      routeId: line.work_order_id,
    });
    if (!snapshot || !snapshot.lines.some((row) => row.id === line.id)) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const selectedLine = snapshot.lines.find((row) => row.id === line.id)!;
    const actorIds = new Set([access.profile.id, access.authUserId]);
    const assignedIds = [
      selectedLine.assigned_tech_id,
      selectedLine.assigned_to,
      ...(snapshot.lineContext.technicianIdsByLine[line.id] ?? []),
    ].filter((value): value is string => Boolean(value));

    return NextResponse.json(
      {
        ...snapshot,
        selectedLineId: line.id,
        actorAssignedToSelectedLine: assignedIds.some((id) => actorIds.has(id)),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[work-order-lines/workspace-detail] load failed", {
      lineId,
      actorId: access.authUserId,
      shopId: access.profile.shop_id,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "This job could not be loaded." },
      { status: 500 },
    );
  }
}
