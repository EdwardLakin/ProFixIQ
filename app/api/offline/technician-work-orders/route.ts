export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";
import type { Database } from "@shared/types/types/supabase";
import type {
  TechnicianOfflineBundle,
  TechnicianOfflineWorkOrder,
} from "@/features/work-orders/mobile/technicianOfflineTypes";
import {
  collectTechnicianIdsForLineContexts,
  emptyCanonicalWorkOrderLineContext,
  loadCanonicalWorkOrderLineContexts,
  loadRowsForIdChunks,
} from "@/features/work-orders/lib/data/loadCanonicalWorkOrderLineContext";
import { resolveTechnicianDisplayName } from "@/features/work-orders/lib/display/linePresentation";
import { resolveTechnicianAssignmentContract } from "@/features/work-orders/lib/technicianAssignmentContract";
import { resolveWorkOrderFinancialAccess } from "@/features/work-orders/workspace/server/workOrderFinancialAuthorization";
import {
  projectCanonicalLineContextFinancialFields,
  projectQuoteLineFinancialFields,
  projectWorkOrderFinancialFields,
  projectWorkOrderLineFinancialFields,
} from "@/features/work-orders/workspace/workOrderFinancialProjection";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type QuoteLine = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type AssignmentCandidate = Pick<
  WorkOrderLine,
  "id" | "work_order_id" | "assigned_tech_id" | "assigned_to"
>;
type AssignmentRow = Pick<
  DB["public"]["Tables"]["work_order_line_technicians"]["Row"],
  "work_order_line_id" | "technician_id"
>;

function chunks<T>(items: T[], size = 100): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function GET() {
  const authClient = createServerSupabaseRoute();
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { profile, error: profileError } =
    await resolveAuthenticatedStaffProfile(authClient, user.id);
  if (profileError || !profile?.shop_id) {
    return NextResponse.json({ error: "Missing shop" }, { status: 403 });
  }
  if (!getActorCapabilities({ role: profile.role }).canPerformAssignedWork) {
    return NextResponse.json(
      { error: "Assigned technician work is not available for this role." },
      { status: 403 },
    );
  }

  const { error: shopContextError } = await authClient.rpc(
    "set_current_shop_id",
    { p_shop_id: profile.shop_id },
  );
  if (shopContextError) {
    return NextResponse.json(
      { error: "Shop security context could not be initialized." },
      { status: 500 },
    );
  }

  const admin = createAdminSupabase();
  const financial = await resolveWorkOrderFinancialAccess({
    supabase: authClient,
    profileId: profile.id,
    shopId: profile.shop_id,
  });
  if (financial.error) {
    return NextResponse.json(
      { error: "Workspace authorization could not be resolved." },
      { status: 500 },
    );
  }
  let primaryCandidates: Array<{ id: string }>;
  let legacyCandidates: Array<{ id: string }>;
  let sharedAssigned: Array<{ work_order_line_id: string }>;
  try {
    [primaryCandidates, legacyCandidates, sharedAssigned] = await Promise.all([
      loadRowsForIdChunks<{ id: string }>(
        [profile.id],
        ([technicianId], from, to) =>
          admin
            .from("work_order_lines")
            .select("id")
            .eq("shop_id", profile.shop_id)
            .eq("line_type", "job")
            .eq("assigned_tech_id", technicianId)
            .order("id", { ascending: true })
            .range(from, to),
      ),
      loadRowsForIdChunks<{ id: string }>(
        [profile.id],
        ([technicianId], from, to) =>
          admin
            .from("work_order_lines")
            .select("id")
            .eq("shop_id", profile.shop_id)
            .eq("line_type", "job")
            .eq("assigned_to", technicianId)
            .order("id", { ascending: true })
            .range(from, to),
      ),
      loadRowsForIdChunks<{ work_order_line_id: string }>(
        [profile.id],
        (technicianIds, from, to) =>
          admin
            .from("work_order_line_technicians")
            .select("work_order_line_id")
            .in("technician_id", technicianIds)
            .order("work_order_line_id", { ascending: true })
            .range(from, to),
      ),
    ]);
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

  const sharedLineIds = (sharedAssigned ?? []).map(
    (row) => row.work_order_line_id,
  );
  const candidateLineIds = [
    ...new Set([
      ...primaryCandidates.map((row) => row.id),
      ...legacyCandidates.map((row) => row.id),
      ...sharedLineIds,
    ]),
  ];
  let candidateLines: AssignmentCandidate[];
  let candidateAssignments: AssignmentRow[];
  try {
    [candidateLines, candidateAssignments] = await Promise.all([
      loadRowsForIdChunks<AssignmentCandidate>(
        candidateLineIds,
        (ids, from, to) =>
          admin
            .from("work_order_lines")
            .select("id, work_order_id, assigned_tech_id, assigned_to")
            .eq("shop_id", profile.shop_id)
            .eq("line_type", "job")
            .in("id", ids)
            .order("id", { ascending: true })
            .range(from, to),
      ),
      loadRowsForIdChunks<AssignmentRow>(candidateLineIds, (ids, from, to) =>
        admin
          .from("work_order_line_technicians")
          .select("work_order_line_id, technician_id")
          .in("work_order_line_id", ids)
          .order("work_order_line_id", { ascending: true })
          .order("technician_id", { ascending: true })
          .range(from, to),
      ),
    ]);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Shared assignments could not be loaded.",
      },
      { status: 500 },
    );
  }

  const technicianIdsByLine = new Map<string, string[]>();
  for (const assignment of candidateAssignments) {
    technicianIdsByLine.set(assignment.work_order_line_id, [
      ...(technicianIdsByLine.get(assignment.work_order_line_id) ?? []),
      assignment.technician_id,
    ]);
  }
  const assignedRows = candidateLines.filter((line) =>
    resolveTechnicianAssignmentContract({
      primaryTechnicianId: line.assigned_tech_id,
      legacyAssignedTo: line.assigned_to,
      canonicalTechnicianIds: technicianIdsByLine.get(line.id),
    }).technicianIds.includes(profile.id),
  );
  const assignedLineIds = new Set(assignedRows.map((row) => row.id));
  const workOrderIds = [
    ...new Set(assignedRows.map((row) => row.work_order_id).filter(Boolean)),
  ] as string[];
  if (workOrderIds.length === 0) {
    const empty: TechnicianOfflineBundle = {
      scope: { userId: user.id, shopId: profile.shop_id },
      downloadedAt: new Date().toISOString(),
      workOrders: [],
    };
    return NextResponse.json(empty, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  // Assignment candidates above are resolved and re-verified before the
  // trusted reader is used. Every record is role-shaped below before it can
  // cross the response/offline-cache boundary.
  const workOrderResults = await Promise.all(
    chunks(workOrderIds).map((ids) =>
      admin
        .from("work_orders")
        .select("*")
        .eq("shop_id", profile.shop_id)
        .in("id", ids)
        .or("type.neq.historical_import,type.is.null"),
    ),
  );
  const workOrdersError = workOrderResults.find(
    (result) => result.error,
  )?.error;
  if (workOrdersError) {
    return NextResponse.json(
      { error: workOrdersError.message },
      { status: 500 },
    );
  }

  const workOrders = workOrderResults
    .flatMap((result) => (result.data ?? []) as WorkOrder[])
    .sort(
      (a, b) =>
        new Date(b.created_at ?? 0).getTime() -
        new Date(a.created_at ?? 0).getTime(),
    );
  if (workOrders.length === 0) {
    const empty: TechnicianOfflineBundle = {
      scope: { userId: user.id, shopId: profile.shop_id },
      downloadedAt: new Date().toISOString(),
      workOrders: [],
    };
    return NextResponse.json(empty, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const allowedWorkOrderIds = workOrders.map((row) => row.id);
  const vehicleIds = [
    ...new Set(workOrders.map((row) => row.vehicle_id).filter(Boolean)),
  ] as string[];
  const customerIds = [
    ...new Set(workOrders.map((row) => row.customer_id).filter(Boolean)),
  ] as string[];
  const shopResultPromise = admin
    .from("shops")
    .select("labor_rate")
    .eq("id", profile.shop_id)
    .maybeSingle<{ labor_rate: number | null }>();
  let lines: WorkOrderLine[];
  let quoteLines: QuoteLine[];
  let vehicles: Vehicle[];
  let customers: Customer[];
  try {
    [lines, quoteLines, vehicles, customers] = await Promise.all([
      loadRowsForIdChunks<WorkOrderLine>(allowedWorkOrderIds, (ids, from, to) =>
        admin
          .from("work_order_lines")
          .select("*")
          .eq("shop_id", profile.shop_id)
          .in("work_order_id", ids)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      loadRowsForIdChunks<QuoteLine>(allowedWorkOrderIds, (ids, from, to) =>
        admin
          .from("work_order_quote_lines")
          .select("*")
          .in("work_order_id", ids)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      loadRowsForIdChunks<Vehicle>(vehicleIds, (ids, from, to) =>
        admin
          .from("vehicles")
          .select("*")
          .eq("shop_id", profile.shop_id)
          .in("id", ids)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      loadRowsForIdChunks<Customer>(customerIds, (ids, from, to) =>
        admin
          .from("customers")
          .select("*")
          .eq("shop_id", profile.shop_id)
          .in("id", ids)
          .order("id", { ascending: true })
          .range(from, to),
      ),
    ]);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Offline supporting records could not be loaded.",
      },
      { status: 500 },
    );
  }

  const shopResult = await shopResultPromise;
  if (shopResult.error) {
    return NextResponse.json(
      { error: shopResult.error.message },
      { status: 500 },
    );
  }

  let lineContextsByWorkOrder = new Map<
    string,
    ReturnType<typeof emptyCanonicalWorkOrderLineContext>
  >();
  try {
    lineContextsByWorkOrder = await loadCanonicalWorkOrderLineContexts({
      supabase: admin,
      shopId: profile.shop_id,
      workOrders: workOrders.map((workOrder) => ({
        workOrderId: workOrder.id,
        lineIds: lines
          .filter((line) => line.work_order_id === workOrder.id)
          .map((line) => line.id),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Canonical work-order context could not be loaded.",
      },
      { status: 500 },
    );
  }

  const techIds = collectTechnicianIdsForLineContexts(
    lineContextsByWorkOrder.values(),
    lines.map((line) => line.assigned_tech_id),
  );
  let technicians: Array<{
    id: string;
    full_name: string | null;
    username: string | null;
    email: string | null;
  }>;
  try {
    technicians = await loadRowsForIdChunks(techIds, (ids, from, to) =>
      admin
        .from("profiles")
        .select("id, full_name, username, email")
        .eq("shop_id", profile.shop_id)
        .in("id", ids)
        .order("id", { ascending: true })
        .range(from, to),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Technician names could not be loaded.",
      },
      { status: 500 },
    );
  }
  const techNamesById = Object.fromEntries(
    technicians.map((technician) => [
      technician.id,
      resolveTechnicianDisplayName(
        technician.full_name,
        technician.username ?? technician.email,
      ) ?? "Technician",
    ]),
  );

  const shopLaborRate =
    financial.access.canViewSellPricing &&
    typeof shopResult.data?.labor_rate === "number"
      ? shopResult.data.labor_rate
      : null;

  const bundle: TechnicianOfflineBundle = {
    scope: { userId: user.id, shopId: profile.shop_id },
    downloadedAt: new Date().toISOString(),
    workOrders: workOrders.map<TechnicianOfflineWorkOrder>((workOrder) => ({
      workOrder: projectWorkOrderFinancialFields(workOrder, financial.access),
      lines: lines
        .filter((line) => line.work_order_id === workOrder.id)
        .map((line) =>
          projectWorkOrderLineFinancialFields(line, financial.access),
        ),
      quoteLines: quoteLines
        .filter((line) => line.work_order_id === workOrder.id)
        .map((line) => projectQuoteLineFinancialFields(line, financial.access)),
      vehicle:
        vehicles.find((vehicle) => vehicle.id === workOrder.vehicle_id) ?? null,
      customer:
        customers.find((customer) => customer.id === workOrder.customer_id) ??
        null,
      techNamesById,
      lineContext: projectCanonicalLineContextFinancialFields(
        lineContextsByWorkOrder.get(workOrder.id) ??
          emptyCanonicalWorkOrderLineContext(),
        financial.access,
      ),
      shopLaborRate,
      financialAccess: financial.access,
      assignedLineIds: lines
        .filter(
          (line) =>
            line.work_order_id === workOrder.id && assignedLineIds.has(line.id),
        )
        .map((line) => line.id),
    })),
  };

  return NextResponse.json(bundle, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
