export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { loadRowsForIdChunks } from "@/features/work-orders/lib/data/loadCanonicalWorkOrderLineContext";
import { resolveTechnicianAssignmentContract } from "@/features/work-orders/lib/technicianAssignmentContract";
import { ACTIVE_WORK_ORDER_STATUSES } from "@/features/work-orders/lib/work-order-status";
import { resolveWorkOrderFinancialAccess } from "@/features/work-orders/workspace/server/workOrderFinancialAuthorization";
import {
  projectWorkOrderFinancialFields,
  projectWorkOrderLineFinancialFields,
} from "@/features/work-orders/workspace/workOrderFinancialProjection";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];

const LINE_SUMMARY_COLUMNS =
  "id, work_order_id, status, approval_state, assigned_tech_id, assigned_to, hold_reason, line_type, punched_in_at, punched_out_at";

type LineSummary = Pick<
  WorkOrderLine,
  | "id"
  | "work_order_id"
  | "status"
  | "approval_state"
  | "assigned_tech_id"
  | "assigned_to"
  | "hold_reason"
  | "line_type"
  | "punched_in_at"
  | "punched_out_at"
>;

type AssignmentRow = Pick<
  DB["public"]["Tables"]["work_order_line_technicians"]["Row"],
  "work_order_line_id" | "technician_id"
>;

const MAX_LIMIT = 100;

/**
 * Bounded list projection for the mobile "My work orders" queue.
 *
 * Technicians cannot read work_orders/work_order_lines through PostgREST: the
 * restrictive financial-capability policies fail closed for staff without
 * sell/invoice visibility, so a browser query returns zero rows. The offline
 * bundle route is the other authorized reader, but it deliberately walks every
 * line ever assigned and hydrates quote lines, canonical contexts, customers
 * and vehicles for each work order — correct for an explicit offline download,
 * far too much for a list screen that reloads on every filter change, focus
 * and realtime event.
 *
 * This route answers only the list question: the technician's assigned work
 * orders for one lifecycle filter, capped at MAX_LIMIT, with just the line
 * fields the queue badges need.
 */
export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const actor = getActorCapabilities({ role: access.profile.role });
  if (!actor.canPerformAssignedWork) {
    return NextResponse.json(
      { error: "Assigned work is not available for this role." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const requestedStatus = (url.searchParams.get("status") ?? "").trim();
  const parsedLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(parsedLimit)))
    : MAX_LIMIT;

  const shopId = access.profile.shop_id;
  const technicianId = access.profile.id;
  const admin = createAdminSupabase();

  const financial = await resolveWorkOrderFinancialAccess({
    supabase: access.supabase,
    profileId: technicianId,
    shopId,
  });
  if (financial.error) {
    return NextResponse.json(
      { error: "Workspace authorization could not be resolved." },
      { status: 500 },
    );
  }

  // Resolve the technician's assigned work orders first so the work-order read
  // below is already narrowed. All three assignment representations are
  // candidates; the canonical contract re-verifies each one.
  let assignedWorkOrderIds: string[];
  try {
    const [primary, legacy, bridged] = await Promise.all([
      loadRowsForIdChunks<{ id: string; work_order_id: string | null }>(
        [technicianId],
        ([id], from, to) =>
          admin
            .from("work_order_lines")
            .select("id, work_order_id")
            .eq("shop_id", shopId)
            .eq("line_type", "job")
            .eq("assigned_tech_id", id)
            .order("id", { ascending: true })
            .range(from, to),
      ),
      loadRowsForIdChunks<{ id: string; work_order_id: string | null }>(
        [technicianId],
        ([id], from, to) =>
          admin
            .from("work_order_lines")
            .select("id, work_order_id")
            .eq("shop_id", shopId)
            .eq("line_type", "job")
            .eq("assigned_to", id)
            .order("id", { ascending: true })
            .range(from, to),
      ),
      loadRowsForIdChunks<{ work_order_line_id: string }>(
        [technicianId],
        (ids, from, to) =>
          admin
            .from("work_order_line_technicians")
            .select("work_order_line_id")
            .in("technician_id", ids)
            .order("work_order_line_id", { ascending: true })
            .range(from, to),
      ),
    ]);

    const bridgedLineIds = bridged.map((row) => row.work_order_line_id);
    const bridgedLines = await loadRowsForIdChunks<{
      work_order_id: string | null;
    }>(bridgedLineIds, (ids, from, to) =>
      admin
        .from("work_order_lines")
        .select("work_order_id")
        .eq("shop_id", shopId)
        .eq("line_type", "job")
        .in("id", ids)
        .order("id", { ascending: true })
        .range(from, to),
    );

    assignedWorkOrderIds = [
      ...new Set(
        [...primary, ...legacy, ...bridgedLines]
          .map((row) => row.work_order_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Assignments could not be loaded.",
      },
      { status: 500 },
    );
  }

  if (assignedWorkOrderIds.length === 0) {
    return NextResponse.json(
      { workOrders: [], lines: [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  // The lifecycle filter runs in the database, so a long-tenured technician's
  // closed history never crosses the wire for an Active queue.
  let workOrderQuery = admin
    .from("work_orders")
    .select(
      `
        *,
        customers:customers(first_name,last_name,phone),
        vehicles:vehicles(year,make,model,license_plate)
      `,
    )
    .eq("shop_id", shopId)
    .eq("record_type", "work_order")
    .is("archived_at", null)
    .in("id", assignedWorkOrderIds)
    .or("type.neq.historical_import,type.is.null")
    .order("created_at", { ascending: false })
    .limit(limit);

  workOrderQuery = requestedStatus
    ? workOrderQuery.eq("status", requestedStatus)
    : workOrderQuery.in("status", [...ACTIVE_WORK_ORDER_STATUSES]);

  const { data: workOrderData, error: workOrderError } = await workOrderQuery;
  if (workOrderError) {
    return NextResponse.json(
      { error: workOrderError.message },
      { status: 500 },
    );
  }

  const workOrders = (workOrderData ?? []) as Array<
    WorkOrder & { customers: unknown; vehicles: unknown }
  >;
  if (workOrders.length === 0) {
    return NextResponse.json(
      { workOrders: [], lines: [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const visibleWorkOrderIds = workOrders.map((row) => row.id);
  let lines: LineSummary[];
  let assignments: AssignmentRow[];
  try {
    lines = await loadRowsForIdChunks<LineSummary>(
      visibleWorkOrderIds,
      (ids, from, to) =>
        admin
          .from("work_order_lines")
          .select(LINE_SUMMARY_COLUMNS)
          .eq("shop_id", shopId)
          .in("work_order_id", ids)
          .order("id", { ascending: true })
          .range(from, to),
    );
    assignments = await loadRowsForIdChunks<AssignmentRow>(
      lines.map((line) => line.id),
      (ids, from, to) =>
        admin
          .from("work_order_line_technicians")
          .select("work_order_line_id, technician_id")
          .in("work_order_line_id", ids)
          .order("work_order_line_id", { ascending: true })
          .order("technician_id", { ascending: true })
          .range(from, to),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Assigned queue lines could not be loaded.",
      },
      { status: 500 },
    );
  }

  const technicianIdsByLine = new Map<string, string[]>();
  for (const assignment of assignments) {
    technicianIdsByLine.set(assignment.work_order_line_id, [
      ...(technicianIdsByLine.get(assignment.work_order_line_id) ?? []),
      assignment.technician_id,
    ]);
  }

  return NextResponse.json(
    {
      workOrders: workOrders.map((row) => ({
        ...projectWorkOrderFinancialFields(row as WorkOrder, financial.access),
        customers: row.customers ?? null,
        vehicles: row.vehicles ?? null,
      })),
      lines: lines.map((line) => ({
        ...projectWorkOrderLineFinancialFields(
          line as WorkOrderLine,
          financial.access,
        ),
        technicianIds:
          resolveTechnicianAssignmentContract({
            primaryTechnicianId: line.assigned_tech_id,
            legacyAssignedTo: line.assigned_to,
            canonicalTechnicianIds: technicianIdsByLine.get(line.id),
          }).technicianIds,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
