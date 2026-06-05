// app/api/assignables/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  ASSIGNABLE_TECHNICIAN_ROLES,
  canActorAssignInShop,
  canRoleAssignWorkOrders,
  logAssignmentDiagnostic,
} from "@/features/work-orders/lib/server/assignment-access";

type WorkOrderScope = { id: string; shop_id: string | null };
type WorkOrderLineScope = { id: string; work_order_id: string; shop_id: string | null };

function jsonError(error: string, status: number, message?: string) {
  return NextResponse.json({ error, message: message ?? error }, { status });
}

export async function GET(req: Request) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) {
    logAssignmentDiagnostic({ actorPresent: false, reason: "not_authenticated" });
    return jsonError("not_authenticated", 401, "Not authenticated");
  }

  const admin = createAdminSupabase();
  const url = new URL(req.url);
  const workOrderId = url.searchParams.get("work_order_id")?.trim() || null;
  const workOrderLineId = url.searchParams.get("work_order_line_id")?.trim() || null;

  let targetShopId = access.profile.shop_id;
  let resolvedWorkOrderId: string | null = workOrderId;

  if (!canRoleAssignWorkOrders(access.profile.role)) {
    logAssignmentDiagnostic({
      actorPresent: true,
      actorProfileId: access.profile.id,
      actorRole: access.profile.role,
      activeShopId: access.profile.shop_id,
      workOrderId,
      lineId: workOrderLineId,
      reason: "forbidden_assignment_role",
    });
    return jsonError("forbidden_assignment_role", 403, "Current role cannot assign technicians");
  }

  if (workOrderLineId) {
    const { data: line, error: lineErr } = await admin
      .from("work_order_lines")
      .select("id, work_order_id, shop_id")
      .eq("id", workOrderLineId)
      .maybeSingle<WorkOrderLineScope>();

    if (lineErr) return jsonError("assignment_failed", 400, lineErr.message);
    if (!line) {
      logAssignmentDiagnostic({
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        lineId: workOrderLineId,
        reason: "line_not_found",
      });
      return jsonError("line_not_found", 404, "Work order line not found");
    }

    resolvedWorkOrderId = line.work_order_id;
    const { data: wo, error: woErr } = await admin
      .from("work_orders")
      .select("id, shop_id")
      .eq("id", line.work_order_id)
      .maybeSingle<WorkOrderScope>();

    if (woErr) return jsonError("assignment_failed", 400, woErr.message);
    if (!wo?.shop_id) {
      logAssignmentDiagnostic({
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        workOrderId: line.work_order_id,
        lineId: workOrderLineId,
        reason: "work_order_not_found",
      });
      return jsonError("work_order_not_found", 404, "Work order not found");
    }
    targetShopId = wo.shop_id;
  } else if (workOrderId) {
    const { data: wo, error: woErr } = await admin
      .from("work_orders")
      .select("id, shop_id")
      .eq("id", workOrderId)
      .maybeSingle<WorkOrderScope>();

    if (woErr) return jsonError("assignment_failed", 400, woErr.message);
    if (!wo?.shop_id) {
      logAssignmentDiagnostic({
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        workOrderId,
        reason: "work_order_not_found",
      });
      return jsonError("work_order_not_found", 404, "Work order not found");
    }
    targetShopId = wo.shop_id;
  } else {
    console.warn("[assignables] target work order was not provided; using actor active shop", {
      actorPresent: true,
      actorProfileId: access.profile.id,
      actorRole: access.profile.role,
      activeShopId: access.profile.shop_id,
      targetShopId,
      reason: "target_not_provided",
    });
  }

  const canAssignInTargetShop = await canActorAssignInShop({
    admin,
    profile: access.profile,
    targetShopId,
  });

  if (!canAssignInTargetShop) {
    logAssignmentDiagnostic({
      actorPresent: true,
      actorProfileId: access.profile.id,
      actorRole: access.profile.role,
      activeShopId: access.profile.shop_id,
      targetShopId,
      workOrderId: resolvedWorkOrderId,
      lineId: workOrderLineId,
      reason: "forbidden_shop",
    });
    return jsonError("forbidden_shop", 403, "Current user cannot assign in this shop");
  }

  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, role, shop_id")
    .eq("shop_id", targetShopId)
    .in("role", [...ASSIGNABLE_TECHNICIAN_ROLES])
    .order("full_name", { ascending: true });

  if (error) {
    return jsonError("assignment_failed", 400, error.message);
  }

  return NextResponse.json({ data: data ?? [], target_shop_id: targetShopId });
}
