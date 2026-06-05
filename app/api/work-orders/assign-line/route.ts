// app/api/work-orders/assign-line/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  canActorAssignInShop,
  canRoleAssignWorkOrders,
  isAssignableTechnicianRole,
  logAssignmentDiagnostic,
} from "@/features/work-orders/lib/server/assignment-access";

type Body = {
  work_order_line_id?: string;
  tech_id?: string;
};

type WorkOrderLineScope = {
  id: string;
  line_type: string | null;
  work_order_id: string;
  shop_id: string | null;
};

type WorkOrderScope = {
  id: string;
  shop_id: string | null;
};

type TechnicianScope = {
  id: string;
  role: string | null;
  full_name: string | null;
  shop_id: string | null;
};

function jsonError(error: string, status: number, message?: string) {
  return NextResponse.json({ error, message: message ?? error }, { status });
}

export async function POST(req: Request) {
  let access: Awaited<ReturnType<typeof requireShopScopedApiAccess>> | null = null;
  let lineId: string | null = null;
  let workOrderId: string | null = null;
  let targetShopId: string | null = null;

  try {
    const body = (await req.json()) as Body;
    lineId = body.work_order_line_id ?? null;
    const techId = body.tech_id ?? null;

    access = await requireShopScopedApiAccess();
    if (!access.ok) {
      logAssignmentDiagnostic({ actorPresent: false, lineId, reason: "not_authenticated" });
      return jsonError("not_authenticated", 401, "Not authenticated");
    }

    if (!lineId || !techId) {
      logAssignmentDiagnostic({
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        lineId,
        reason: "missing_assignment_fields",
      });
      return jsonError("assignment_failed", 400, "work_order_line_id and tech_id are required");
    }

    const admin = createAdminSupabase();

    if (!canRoleAssignWorkOrders(access.profile.role)) {
      logAssignmentDiagnostic({
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        lineId,
        reason: "forbidden_assignment_role",
      });
      return jsonError("forbidden_assignment_role", 403, "Current role cannot assign technicians");
    }

    const { data: line, error: lineReadErr } = await admin
      .from("work_order_lines")
      .select("id, line_type, work_order_id, shop_id")
      .eq("id", lineId)
      .maybeSingle<WorkOrderLineScope>();

    if (lineReadErr) {
      logAssignmentDiagnostic({
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        lineId,
        reason: "line_lookup_failed",
      });
      return jsonError("assignment_failed", 400, lineReadErr.message);
    }

    if (!line) {
      logAssignmentDiagnostic({
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        lineId,
        reason: "line_not_found",
      });
      return jsonError("line_not_found", 404, "Work order line not found");
    }

    workOrderId = line.work_order_id;

    const { data: workOrder, error: workOrderErr } = await admin
      .from("work_orders")
      .select("id, shop_id")
      .eq("id", line.work_order_id)
      .maybeSingle<WorkOrderScope>();

    if (workOrderErr) {
      logAssignmentDiagnostic({
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        workOrderId,
        lineId,
        reason: "work_order_lookup_failed",
      });
      return jsonError("assignment_failed", 400, workOrderErr.message);
    }

    if (!workOrder?.shop_id) {
      logAssignmentDiagnostic({
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        workOrderId,
        lineId,
        reason: "work_order_not_found",
      });
      return jsonError("work_order_not_found", 404, "Work order not found");
    }

    targetShopId = workOrder.shop_id;

    if ((line.line_type ?? "job") === "info") {
      logAssignmentDiagnostic({
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        targetShopId,
        workOrderId,
        lineId,
        reason: "info_line_not_assignable",
      });
      return jsonError("assignment_failed", 409, "Info lines cannot be technician-assigned");
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
        workOrderId,
        lineId,
        reason: "forbidden_shop",
      });
      return jsonError("forbidden_shop", 403, "Current user cannot assign in this shop");
    }

    const { data: technician, error: technicianErr } = await admin
      .from("profiles")
      .select("id, role, full_name, shop_id")
      .eq("id", techId)
      .eq("shop_id", targetShopId)
      .maybeSingle<TechnicianScope>();

    if (technicianErr) {
      logAssignmentDiagnostic({
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        targetShopId,
        workOrderId,
        lineId,
        reason: "technician_lookup_failed",
      });
      return jsonError("assignment_failed", 400, technicianErr.message);
    }

    if (!technician || !isAssignableTechnicianRole(technician.role)) {
      logAssignmentDiagnostic({
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        targetShopId,
        workOrderId,
        lineId,
        reason: "technician_not_found",
      });
      return jsonError("technician_not_found", 404, "Assignable technician not found in target shop");
    }

    const { data: updatedLine, error: lineErr } = await admin
      .from("work_order_lines")
      .update({ assigned_tech_id: techId })
      .eq("id", lineId)
      .eq("shop_id", targetShopId)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (lineErr || !updatedLine) {
      logAssignmentDiagnostic({
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        targetShopId,
        workOrderId,
        lineId,
        reason: "assignment_failed",
      });
      return jsonError("assignment_failed", 400, lineErr?.message ?? "Assignment update failed");
    }

    const { error: relErr } = await admin
      .from("work_order_line_technicians")
      .upsert(
        {
          work_order_line_id: lineId,
          technician_id: techId,
          assigned_by: access.profile.id,
        },
        { onConflict: "work_order_line_id,technician_id" },
      );

    if (relErr) {
      console.warn("[work-order-assignment] bridge upsert failed", {
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        targetShopId,
        workOrderId,
        lineId,
        reason: "bridge_upsert_failed",
        code: relErr.code,
        message: relErr.message,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    const profile = access?.ok ? access.profile : null;
    logAssignmentDiagnostic({
      actorPresent: Boolean(profile),
      actorProfileId: profile?.id,
      actorRole: profile?.role,
      activeShopId: profile?.shop_id,
      targetShopId,
      workOrderId,
      lineId,
      reason: "assignment_failed",
    });
    return jsonError("assignment_failed", 500, msg);
  }
}
