// app/api/work-orders/assign-all/route.ts
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
  work_order_id: string;
  tech_id: string;
  only_unassigned?: boolean;
};

type LineTechInsert = {
  work_order_line_id: string;
  technician_id: string;
  assigned_by?: string | null;
};

type WorkOrderScope = { id: string; shop_id: string | null };
type TechnicianScope = { id: string; role: string | null; full_name: string | null; shop_id: string | null };

function jsonError(error: string, status: number, message?: string) {
  return NextResponse.json({ error, message: message ?? error }, { status });
}

export async function POST(req: Request) {
  let access: Awaited<ReturnType<typeof requireShopScopedApiAccess>> | null = null;
  let workOrderId: string | null = null;
  let targetShopId: string | null = null;

  try {
    const body = (await req.json()) as Partial<Body>;
    const { work_order_id, tech_id, only_unassigned = true } = body;
    workOrderId = work_order_id ?? null;

    access = await requireShopScopedApiAccess();
    if (!access.ok) {
      logAssignmentDiagnostic({ actorPresent: false, workOrderId, reason: "not_authenticated" });
      return jsonError("not_authenticated", 401, "Not authenticated");
    }

    if (!work_order_id || !tech_id) {
      logAssignmentDiagnostic({
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        workOrderId,
        reason: "missing_assignment_fields",
      });
      return jsonError("assignment_failed", 400, "work_order_id and tech_id are required");
    }

    const actorProfile = access.profile;
    const admin = createAdminSupabase();

    if (!canRoleAssignWorkOrders(access.profile.role)) {
      logAssignmentDiagnostic({
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        workOrderId,
        reason: "forbidden_assignment_role",
      });
      return jsonError("forbidden_assignment_role", 403, "Current role cannot assign technicians");
    }

    const { data: wo, error: woErr } = await admin
      .from("work_orders")
      .select("id, shop_id")
      .eq("id", work_order_id)
      .maybeSingle<WorkOrderScope>();

    if (woErr) {
      logAssignmentDiagnostic({
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        workOrderId,
        reason: "work_order_lookup_failed",
      });
      return jsonError("assignment_failed", 400, woErr.message);
    }

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
        reason: "forbidden_shop",
      });
      return jsonError("forbidden_shop", 403, "Current user cannot assign in this shop");
    }

    const { data: techProfile, error: techErr } = await admin
      .from("profiles")
      .select("id, role, full_name, shop_id")
      .eq("id", tech_id)
      .eq("shop_id", targetShopId)
      .maybeSingle<TechnicianScope>();

    if (techErr) {
      logAssignmentDiagnostic({
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        targetShopId,
        workOrderId,
        reason: "technician_lookup_failed",
      });
      return jsonError("assignment_failed", 400, techErr.message);
    }

    if (!techProfile || !isAssignableTechnicianRole(techProfile.role)) {
      logAssignmentDiagnostic({
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        targetShopId,
        workOrderId,
        reason: "technician_not_found",
      });
      return jsonError("technician_not_found", 404, "Assignable technician not found in target shop");
    }

    let updateQuery = admin
      .from("work_order_lines")
      .update({ assigned_tech_id: tech_id })
      .eq("work_order_id", work_order_id)
      .eq("shop_id", targetShopId)
      .eq("line_type", "job");

    if (only_unassigned) {
      updateQuery = updateQuery.is("assigned_tech_id", null);
    }

    const { data: updatedRows, error: updErr } = await updateQuery.select("id");

    if (updErr) {
      logAssignmentDiagnostic({
        actorPresent: true,
        actorProfileId: access.profile.id,
        actorRole: access.profile.role,
        activeShopId: access.profile.shop_id,
        targetShopId,
        workOrderId,
        reason: "assignment_failed",
      });
      return jsonError("assignment_failed", 400, updErr.message);
    }

    if (updatedRows && updatedRows.length > 0) {
      const linkRows: LineTechInsert[] = updatedRows.map((row) => ({
        work_order_line_id: row.id,
        technician_id: tech_id,
        assigned_by: actorProfile.id,
      }));

      const { error: linkErr } = await admin
        .from("work_order_line_technicians")
        .upsert(linkRows, { onConflict: "work_order_line_id,technician_id" });

      if (linkErr) {
        console.warn("[work-order-assignment] bridge upsert failed", {
          actorPresent: true,
          actorProfileId: access.profile.id,
          actorRole: access.profile.role,
          activeShopId: access.profile.shop_id,
          targetShopId,
          workOrderId,
          reason: "bridge_upsert_failed",
          code: linkErr.code,
          message: linkErr.message,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      updated_count: updatedRows?.length ?? 0,
      tech: {
        id: techProfile.id,
        role: techProfile.role,
        full_name: techProfile.full_name,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error.";
    const profile = access?.ok ? access.profile : null;
    logAssignmentDiagnostic({
      actorPresent: Boolean(profile),
      actorProfileId: profile?.id,
      actorRole: profile?.role,
      activeShopId: profile?.shop_id,
      targetShopId,
      workOrderId,
      reason: "assignment_failed",
    });
    return jsonError("assignment_failed", 500, msg);
  }
}
