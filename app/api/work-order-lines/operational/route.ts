export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { listFieldOperatorAssignedWorkOrderIds } from "@/features/mobile/service/server/access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import {
  resolveShopProductAccess,
  SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  SHOP_PRODUCT_CAPABILITIES,
} from "@/features/shared/lib/product-access";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { resolveTechnicianAssignmentContract } from "@/features/work-orders/lib/technicianAssignmentContract";
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
    requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  });
  if (!access.ok) return access.response;

  const url = new URL(request.url);
  const requestedLineId = url.searchParams.get("lineId")?.trim() || null;
  const parsedLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(2_000, Math.max(1, Math.trunc(parsedLimit)))
    : 2_000;
  const admin = createAdminSupabase();

  const shopProduct = await resolveShopProductAccess({
    supabase: access.supabase,
    shopId: access.profile.shop_id,
    capabilities: SHOP_PRODUCT_CAPABILITIES,
  });
  let fieldWorkOrderIds: string[] | null = null;
  if (!shopProduct.entitled) {
    try {
      fieldWorkOrderIds = await listFieldOperatorAssignedWorkOrderIds(access);
    } catch {
      return NextResponse.json(
        { error: "Authorization service unavailable" },
        { status: 503 },
      );
    }
  }

  let lineQuery = admin
    .from("work_order_lines")
    .select("*")
    .eq("shop_id", access.profile.shop_id)
    .eq("line_type", "job")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (requestedLineId) lineQuery = lineQuery.eq("id", requestedLineId);
  if (fieldWorkOrderIds) {
    if (fieldWorkOrderIds.length === 0) {
      return NextResponse.json(
        { lines: [], workOrders: [], vehicles: [], shop: null },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    lineQuery = lineQuery.in("work_order_id", fieldWorkOrderIds);
  }

  const { data: candidateData, error: candidateError } = await lineQuery;
  if (candidateError) {
    return NextResponse.json(
      { error: candidateError.message },
      { status: 500 },
    );
  }

  const candidateLines = (candidateData ?? []) as WorkOrderLine[];
  let lines = candidateLines;
  const actor = getActorCapabilities({ role: access.profile.role });
  if (actor.canonicalRole === "mechanic") {
    const candidateIds = candidateLines.map((line) => line.id);
    const { data: bridges, error: bridgeError } = candidateIds.length
      ? await admin
          .from("work_order_line_technicians")
          .select("work_order_line_id, technician_id")
          .in("work_order_line_id", candidateIds)
          .eq("technician_id", access.profile.id)
      : { data: [], error: null };
    if (bridgeError) {
      return NextResponse.json({ error: bridgeError.message }, { status: 500 });
    }

    const bridgeIds = new Set(
      (bridges ?? []).map((row) => row.work_order_line_id),
    );
    lines = candidateLines.filter((line) =>
      resolveTechnicianAssignmentContract({
        primaryTechnicianId: line.assigned_tech_id,
        legacyAssignedTo: line.assigned_to,
        canonicalTechnicianIds: bridgeIds.has(line.id)
          ? [access.profile.id]
          : [],
      }).technicianIds.includes(access.profile.id),
    );
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
      workOrders: workOrders.map((workOrder) =>
        projectWorkOrderFinancialFields(workOrder, denied),
      ),
      vehicles: (vehicleData ?? []) as Vehicle[],
      shop: shop ?? null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
