// app/api/scheduling/assigned-work-order-lines/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { WORKFORCE_STAFF_ROLES } from "@/features/workforce/lib/roster";
import { resolveTechnicianAssignmentContract } from "@/features/work-orders/lib/technicianAssignmentContract";

type AssignedLineRow = {
  id: string;
  work_order_id: string | null;
  description: string | null;
  complaint: string | null;
  job_type: string | null;
  job_priority: string | null;
  created_at: string | null;
  assigned_tech_id: string | null;
  assigned_to: string | null;
};

type AssignmentRow = {
  work_order_line_id: string;
  technician_id: string;
};

async function authz() {
  const access = await requireShopScopedApiAccess({
    allowRoles: [...WORKFORCE_STAFF_ROLES],
  });
  if (!access.ok) {
    return { ok: false as const, res: access.response };
  }
  const actor = getActorCapabilities({ role: access.profile.role });
  const isAdmin = actor.isKnownRole && actor.canManageScheduling;
  return { ok: true as const, me: access.profile, isAdmin };
}

export async function GET(req: NextRequest) {
  const a = await authz();
  if (!a.ok) return a.res;

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id");
  const shopId = searchParams.get("shop_id");
  const workOrderId = searchParams.get("work_order_id");

  if (!shopId || !userId || !workOrderId) {
    return NextResponse.json(
      { error: "Missing shop_id, user_id, or work_order_id" },
      { status: 400 },
    );
  }

  if (shopId !== a.me.shop_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const effectiveUserId = a.isAdmin ? userId : a.me.id;
  const admin = createAdminSupabase();

  const { data: parentWorkOrder, error: parentErr } = await admin
    .from("work_orders")
    .select("id, type")
    .eq("shop_id", shopId)
    .eq("id", workOrderId)
    .maybeSingle<{ id: string; type: string | null }>();

  if (parentErr) return NextResponse.json({ error: parentErr.message }, { status: 500 });
  if (!parentWorkOrder || parentWorkOrder.type === "historical_import") {
    return NextResponse.json({ lines: [] });
  }

  const { data: lineData, error: lineError } = await admin
    .from("work_order_lines")
    .select(
      "id, work_order_id, description, complaint, job_type, created_at, job_priority, assigned_tech_id, assigned_to",
    )
    .eq("shop_id", shopId)
    .eq("work_order_id", workOrderId)
    .eq("line_type", "job")
    .order("created_at", { ascending: true });

  if (lineError) {
    return NextResponse.json({ error: lineError.message }, { status: 500 });
  }

  const lines = (lineData ?? []) as AssignedLineRow[];
  const lineIds = lines.map((line) => line.id);
  const assignmentResult =
    lineIds.length > 0
      ? await admin
          .from("work_order_line_technicians")
          .select("work_order_line_id, technician_id")
          .in("work_order_line_id", lineIds)
      : { data: [] as AssignmentRow[], error: null };
  if (assignmentResult.error) {
    return NextResponse.json(
      { error: assignmentResult.error.message },
      { status: 500 },
    );
  }

  const technicianIdsByLine = new Map<string, string[]>();
  for (const assignment of (assignmentResult.data ?? []) as AssignmentRow[]) {
    technicianIdsByLine.set(assignment.work_order_line_id, [
      ...(technicianIdsByLine.get(assignment.work_order_line_id) ?? []),
      assignment.technician_id,
    ]);
  }

  return NextResponse.json({
    lines: lines
      .filter((line) =>
        resolveTechnicianAssignmentContract({
          primaryTechnicianId: line.assigned_tech_id,
          legacyAssignedTo: line.assigned_to,
          canonicalTechnicianIds: technicianIdsByLine.get(line.id),
        }).technicianIds.includes(effectiveUserId),
      )
      .map((line) => ({
        id: line.id,
        work_order_id: line.work_order_id,
        description: line.description,
        complaint: line.complaint,
        job_type: line.job_type,
        job_priority: line.job_priority,
        created_at: line.created_at,
      })),
  });
}
