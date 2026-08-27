export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  projectWorkOrderFinancialFields,
  projectWorkOrderLineFinancialFields,
} from "@/features/work-orders/workspace/workOrderFinancialProjection";
import { deniedWorkOrderFinancialAccess } from "@/features/work-orders/workspace/workOrderFinancialAccess";
import { WORK_ORDER_WORKSPACE_READER_ROLES } from "@/features/work-orders/workspace/server/loadWorkOrderWorkspaceSnapshot";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess({
    allowRoles: WORK_ORDER_WORKSPACE_READER_ROLES,
  });
  if (!access.ok) return access.response;

  const url = new URL(request.url);
  const requestedLineId = url.searchParams.get("lineId")?.trim() || null;
  const parsedLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(2_000, Math.max(1, Math.trunc(parsedLimit)))
    : 2_000;
  const admin = createAdminSupabase();

  let lineQuery = admin
    .from("work_order_lines")
    .select("*")
    .eq("shop_id", access.profile.shop_id)
    .eq("line_type", "job")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (requestedLineId) lineQuery = lineQuery.eq("id", requestedLineId);

  const { data: candidateData, error: candidateError } = await lineQuery;
  if (candidateError) {
    return NextResponse.json(
      { error: candidateError.message },
      { status: 500 },
    );
  }

  const candidateLines = (candidateData ?? []) as WorkOrderLine[];
  const candidateIds = candidateLines.map((line) => line.id);
  const actorIds = [...new Set([access.profile.id, access.authUserId])];
  const { data: bridges, error: bridgeError } = candidateIds.length
    ? await admin
        .from("work_order_line_technicians")
        .select("work_order_line_id, technician_id")
        .in("work_order_line_id", candidateIds)
        .in("technician_id", actorIds)
    : { data: [], error: null };
  if (bridgeError) {
    return NextResponse.json({ error: bridgeError.message }, { status: 500 });
  }
  const bridgeIds = new Set(
    (bridges ?? []).map((row) => row.work_order_line_id),
  );
  const actorAssigned = (line: WorkOrderLine) =>
    actorIds.includes(line.assigned_tech_id ?? "") ||
    actorIds.includes(line.assigned_to ?? "") ||
    bridgeIds.has(line.id);
  let lines = candidateLines;
  const actor = getActorCapabilities({ role: access.profile.role });
  if (actor.canonicalRole === "mechanic") {
    lines = candidateLines.filter(actorAssigned);
  }

  if (requestedLineId && lines.length === 0) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const workOrderIds = [
    ...new Set(lines.map((line) => line.work_order_id).filter(Boolean)),
  ];
  const { data: workOrderData, error: workOrderError } = workOrderIds.length
    ? await admin
        .from("work_orders")
        .select("*")
        .eq("shop_id", access.profile.shop_id)
        .in("id", workOrderIds)
    : { data: [], error: null };
  if (workOrderError) {
    return NextResponse.json(
      { error: workOrderError.message },
      { status: 500 },
    );
  }

  const workOrders = (workOrderData ?? []) as WorkOrder[];
  const vehicleIds = [
    ...new Set(workOrders.map((row) => row.vehicle_id).filter(Boolean)),
  ] as string[];
  const { data: vehicleData, error: vehicleError } = vehicleIds.length
    ? await admin
        .from("vehicles")
        .select("*")
        .eq("shop_id", access.profile.shop_id)
        .in("id", vehicleIds)
    : { data: [], error: null };
  if (vehicleError) {
    return NextResponse.json({ error: vehicleError.message }, { status: 500 });
  }

  const denied = deniedWorkOrderFinancialAccess();
  const { data: shop } = await admin
    .from("shops")
    .select("id, name, shop_name, business_name, country, timezone")
    .eq("id", access.profile.shop_id)
    .maybeSingle();

  return NextResponse.json(
    {
      lines: lines.map((line) =>
        projectWorkOrderLineFinancialFields(line, denied),
      ),
      executableLineIds: lines.filter(actorAssigned).map((line) => line.id),
      workOrders: workOrders.map((workOrder) =>
        projectWorkOrderFinancialFields(workOrder, denied),
      ),
      vehicles: (vehicleData ?? []) as Vehicle[],
      shop: shop ?? null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
