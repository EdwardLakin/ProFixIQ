import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export type WorkOrderAllocationRow =
  DB["public"]["Tables"]["work_order_part_allocations"]["Row"] & {
    parts?: { name: string | null } | null;
  };

export type CanonicalWorkOrderPartRow =
  DB["public"]["Tables"]["work_order_parts"]["Row"] & {
    parts?: {
      name: string | null;
      sku?: string | null;
      part_number?: string | null;
      manufacturer?: string | null;
      supplier?: string | null;
    } | null;
  };

export type WorkOrderPartRequestRow = Pick<
  DB["public"]["Tables"]["part_requests"]["Row"],
  "id" | "work_order_id" | "quote_line_id" | "job_id" | "status"
>;

export type WorkOrderLineTechnicianRow = Pick<
  DB["public"]["Tables"]["work_order_line_technicians"]["Row"],
  "work_order_line_id" | "technician_id"
>;

export type CanonicalWorkOrderLineContext = {
  allocationsByLine: Record<string, WorkOrderAllocationRow[]>;
  canonicalPartsByLine: Record<string, CanonicalWorkOrderPartRow[]>;
  technicianIdsByLine: Record<string, string[]>;
  partRequestsByLine: Record<string, WorkOrderPartRequestRow[]>;
  partRequestsByQuoteLine: Record<string, WorkOrderPartRequestRow[]>;
};

export function emptyCanonicalWorkOrderLineContext(): CanonicalWorkOrderLineContext {
  return {
    allocationsByLine: {},
    canonicalPartsByLine: {},
    technicianIdsByLine: {},
    partRequestsByLine: {},
    partRequestsByQuoteLine: {},
  };
}

export function buildCanonicalWorkOrderLineContext(input: {
  lineIds: string[];
  allocations: WorkOrderAllocationRow[];
  canonicalParts: CanonicalWorkOrderPartRow[];
  technicians: WorkOrderLineTechnicianRow[];
  partRequests: WorkOrderPartRequestRow[];
}): CanonicalWorkOrderLineContext {
  const lineIds = new Set(input.lineIds);
  const result = emptyCanonicalWorkOrderLineContext();

  for (const allocation of input.allocations) {
    const lineId = allocation.work_order_line_id;
    if (!lineId || !lineIds.has(lineId)) continue;
    (result.allocationsByLine[lineId] ??= []).push(allocation);
  }

  for (const part of input.canonicalParts) {
    const lineId = part.work_order_line_id;
    if (!lineId || !lineIds.has(lineId) || part.is_active === false) continue;
    (result.canonicalPartsByLine[lineId] ??= []).push(part);
  }

  for (const assignment of input.technicians) {
    const lineId = assignment.work_order_line_id;
    if (!lineIds.has(lineId)) continue;
    const ids = (result.technicianIdsByLine[lineId] ??= []);
    if (!ids.includes(assignment.technician_id)) {
      ids.push(assignment.technician_id);
    }
  }

  for (const request of input.partRequests) {
    if (request.job_id && lineIds.has(request.job_id)) {
      (result.partRequestsByLine[request.job_id] ??= []).push(request);
    }
    if (request.quote_line_id) {
      (result.partRequestsByQuoteLine[request.quote_line_id] ??= []).push(
        request,
      );
    }
  }

  return result;
}

export function getPartsRequestStatusLabel(
  requests: WorkOrderPartRequestRow[],
): string | null {
  if (requests.length === 0) return null;
  const statuses = new Set(
    requests.map((request) =>
      String(request.status ?? "requested").toLowerCase(),
    ),
  );
  if (statuses.has("fulfilled")) return "Parts handed off";
  if (
    statuses.has("approved") ||
    statuses.has("partially_ordered") ||
    statuses.has("partially_consumed") ||
    statuses.has("partially_returned")
  ) {
    return "Pick / order active";
  }
  if (statuses.has("quoted")) return "Awaiting approval";
  if (statuses.has("rejected") || statuses.has("cancelled")) {
    return "Parts history recorded";
  }
  return "Parts requested";
}

export async function loadCanonicalWorkOrderLineContexts(input: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  workOrders: Array<{ workOrderId: string; lineIds: string[] }>;
}): Promise<Map<string, CanonicalWorkOrderLineContext>> {
  const workOrders = input.workOrders.map((workOrder) => ({
    workOrderId: workOrder.workOrderId,
    lineIds: [...new Set(workOrder.lineIds.filter(Boolean))],
  }));
  const workOrderIds = [...new Set(workOrders.map((item) => item.workOrderId))];
  const lineIds = [...new Set(workOrders.flatMap((item) => item.lineIds))];
  if (workOrderIds.length === 0 || lineIds.length === 0) {
    return new Map(
      workOrders.map((item) => [
        item.workOrderId,
        emptyCanonicalWorkOrderLineContext(),
      ]),
    );
  }

  const [allocationsResult, partsResult, techniciansResult, requestsResult] =
    await Promise.all([
      input.supabase
        .from("work_order_part_allocations")
        .select("*, parts(name)")
        .eq("shop_id", input.shopId)
        .in("work_order_id", workOrderIds)
        .in("work_order_line_id", lineIds)
        .order("created_at", { ascending: true }),
      input.supabase
        .from("work_order_parts")
        .select("*, parts(name, sku, part_number, manufacturer, supplier)")
        .eq("shop_id", input.shopId)
        .eq("is_active", true)
        .in("work_order_id", workOrderIds)
        .in("work_order_line_id", lineIds)
        .order("created_at", { ascending: true }),
      input.supabase
        .from("work_order_line_technicians")
        .select("work_order_line_id, technician_id")
        .in("work_order_line_id", lineIds),
      input.supabase
        .from("part_requests")
        .select("id, work_order_id, quote_line_id, job_id, status")
        .eq("shop_id", input.shopId)
        .in("work_order_id", workOrderIds)
        .order("created_at", { ascending: true }),
    ]);

  const error =
    allocationsResult.error ??
    partsResult.error ??
    techniciansResult.error ??
    requestsResult.error;
  if (error) throw new Error(error.message);

  const allocations =
    (allocationsResult.data as WorkOrderAllocationRow[] | null) ?? [];
  const canonicalParts =
    (partsResult.data as CanonicalWorkOrderPartRow[] | null) ?? [];
  const technicians =
    (techniciansResult.data as WorkOrderLineTechnicianRow[] | null) ?? [];
  const partRequests =
    (requestsResult.data as WorkOrderPartRequestRow[] | null) ?? [];

  return new Map(
    workOrders.map((workOrder) => {
      const scopedLineIds = new Set(workOrder.lineIds);
      return [
        workOrder.workOrderId,
        buildCanonicalWorkOrderLineContext({
          lineIds: workOrder.lineIds,
          allocations: allocations.filter(
            (row) => row.work_order_id === workOrder.workOrderId,
          ),
          canonicalParts: canonicalParts.filter(
            (row) => row.work_order_id === workOrder.workOrderId,
          ),
          technicians: technicians.filter((row) =>
            scopedLineIds.has(row.work_order_line_id),
          ),
          partRequests: partRequests.filter(
            (row) => row.work_order_id === workOrder.workOrderId,
          ),
        }),
      ];
    }),
  );
}

export async function loadCanonicalWorkOrderLineContext(input: {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
  shopId: string;
  lineIds: string[];
}): Promise<CanonicalWorkOrderLineContext> {
  const contexts = await loadCanonicalWorkOrderLineContexts({
    supabase: input.supabase,
    shopId: input.shopId,
    workOrders: [
      { workOrderId: input.workOrderId, lineIds: input.lineIds },
    ],
  });
  return (
    contexts.get(input.workOrderId) ?? emptyCanonicalWorkOrderLineContext()
  );
}
