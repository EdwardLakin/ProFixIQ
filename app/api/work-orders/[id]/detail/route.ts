// app/api/work-orders/[id]/detail/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  canActorAccessWorkOrderShop,
  logAssignmentDiagnostic,
} from "@/features/work-orders/lib/server/assignment-access";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type LineTech = DB["public"]["Tables"]["work_order_line_technicians"]["Row"];

const looksLikeUuid = (s: string) => s.includes("-") && s.length >= 36;

function splitCustomId(raw: string): { prefix: string; n: number | null } {
  const m = raw.toUpperCase().match(/^([A-Z]+)\s*0*?(\d+)?$/);
  if (!m) return { prefix: raw.toUpperCase(), n: null };
  const n = m[2] ? parseInt(m[2], 10) : null;
  return { prefix: m[1], n: Number.isFinite(n) ? n : null };
}

function jsonError(error: string, status: number, message?: string) {
  return NextResponse.json({ error, message: message ?? error }, { status });
}

async function loadWorkOrder(admin: ReturnType<typeof createAdminSupabase>, routeId: string) {
  if (looksLikeUuid(routeId)) {
    const byId = await admin.from("work_orders").select("*").eq("id", routeId).maybeSingle<WorkOrder>();
    if (byId.error || byId.data) return byId;
  }

  const byCustomId = await admin.from("work_orders").select("*").eq("custom_id", routeId).maybeSingle<WorkOrder>();
  if (byCustomId.error || byCustomId.data) return byCustomId;

  const byCustomIdIlike = await admin.from("work_orders").select("*").ilike("custom_id", routeId.toUpperCase()).maybeSingle<WorkOrder>();
  if (byCustomIdIlike.error || byCustomIdIlike.data) return byCustomIdIlike;

  const { prefix, n } = splitCustomId(routeId);
  if (n === null) return { data: null, error: null } as const;

  const cands = await admin.from("work_orders").select("*").ilike("custom_id", `${prefix}%`).limit(50);
  if (cands.error) return { data: null, error: cands.error };
  const wanted = `${prefix}${n}`;
  const match = ((cands.data ?? []) as WorkOrder[]).find(
    (row) => (row.custom_id ?? "").toUpperCase().replace(/^([A-Z]+)0+/, "$1") === wanted,
  );
  return { data: match ?? null, error: null } as const;
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const access = await requireShopScopedApiAccess();
  const params = await context.params;
  const routeId = params.id;

  if (!access.ok) {
    logAssignmentDiagnostic({ actorPresent: false, workOrderId: routeId, reason: "not_authenticated" });
    return jsonError("not_authenticated", 401, "Not authenticated");
  }

  const admin = createAdminSupabase();
  const { data: workOrder, error: workOrderError } = await loadWorkOrder(admin, routeId);

  if (workOrderError) return jsonError("assignment_failed", 400, workOrderError.message);
  if (!workOrder?.shop_id) {
    logAssignmentDiagnostic({
      actorPresent: true,
      actorProfileId: access.profile.id,
      actorRole: access.profile.role,
      activeShopId: access.profile.shop_id,
      workOrderId: routeId,
      reason: "work_order_not_found",
    });
    return jsonError("work_order_not_found", 404, "Work order not found");
  }

  const targetShopId = workOrder.shop_id;
  const canAccess = await canActorAccessWorkOrderShop({ admin, profile: access.profile, targetShopId });
  if (!canAccess) {
    logAssignmentDiagnostic({
      actorPresent: true,
      actorProfileId: access.profile.id,
      actorRole: access.profile.role,
      activeShopId: access.profile.shop_id,
      targetShopId,
      workOrderId: workOrder.id,
      reason: "forbidden_shop",
    });
    return jsonError("forbidden_shop", 403, "Current user cannot access this work order shop");
  }

  const { data: lines, error: linesError } = await admin
    .from("work_order_lines")
    .select("*")
    .eq("work_order_id", workOrder.id)
    .eq("shop_id", targetShopId)
    .order("created_at", { ascending: true });

  if (linesError) return jsonError("assignment_failed", 400, linesError.message);
  const lineRows = (lines ?? []) as WorkOrderLine[];
  const lineIds = lineRows.map((line) => line.id);

  const [vehicleRes, customerRes, lineTechsRes] = await Promise.all([
    workOrder.vehicle_id
      ? admin.from("vehicles").select("*").eq("id", workOrder.vehicle_id).eq("shop_id", targetShopId).maybeSingle<Vehicle>()
      : Promise.resolve({ data: null, error: null } as const),
    workOrder.customer_id
      ? admin.from("customers").select("*").eq("id", workOrder.customer_id).eq("shop_id", targetShopId).maybeSingle<Customer>()
      : Promise.resolve({ data: null, error: null } as const),
    lineIds.length
      ? admin.from("work_order_line_technicians").select("*").in("work_order_line_id", lineIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  if (vehicleRes.error) {
    console.warn("[work-order-detail] vehicle lookup failed", {
      actorPresent: true,
      actorProfileId: access.profile.id,
      actorRole: access.profile.role,
      activeShopId: access.profile.shop_id,
      targetShopId,
      workOrderId: workOrder.id,
      reason: "vehicle_lookup_failed",
      code: vehicleRes.error.code,
      message: vehicleRes.error.message,
    });
  }

  if (customerRes.error) {
    console.warn("[work-order-detail] customer lookup failed", {
      actorPresent: true,
      actorProfileId: access.profile.id,
      actorRole: access.profile.role,
      activeShopId: access.profile.shop_id,
      targetShopId,
      workOrderId: workOrder.id,
      reason: "customer_lookup_failed",
      code: customerRes.error.code,
      message: customerRes.error.message,
    });
  }

  if (lineTechsRes.error) return jsonError("assignment_failed", 400, lineTechsRes.error.message);

  return NextResponse.json({
    data: {
      work_order: workOrder,
      lines: lineRows,
      customer: customerRes.error ? null : ((customerRes.data as Customer | null) ?? null),
      vehicle: vehicleRes.error ? null : ((vehicleRes.data as Vehicle | null) ?? null),
      line_technicians: (lineTechsRes.data ?? []) as LineTech[],
      actor: {
        profile_id: access.profile.id,
        role: access.profile.role,
        active_shop_id: access.profile.shop_id,
      },
      target_shop_id: targetShopId,
    },
  });
}
