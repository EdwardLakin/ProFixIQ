import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import {
  resolveTechnicianAssignmentContract,
  type TechnicianAssignmentIssue,
} from "@/features/work-orders/lib/technicianAssignmentContract";

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

export type WorkOrderLineAssignmentMirrorRow = Pick<
  DB["public"]["Tables"]["work_order_lines"]["Row"],
  "id" | "assigned_tech_id" | "assigned_to"
>;

export type WorkOrderLineLaborSegmentRow = Pick<
  DB["public"]["Tables"]["work_order_line_labor_segments"]["Row"],
  "work_order_line_id" | "technician_id" | "ended_at"
>;

export type CanonicalWorkOrderLineContext = {
  allocationsByLine: Record<string, WorkOrderAllocationRow[]>;
  canonicalPartsByLine: Record<string, CanonicalWorkOrderPartRow[]>;
  technicianIdsByLine: Record<string, string[]>;
  primaryTechnicianIdByLine?: Record<string, string | null>;
  assignmentIssuesByLine?: Record<string, TechnicianAssignmentIssue[]>;
  activeTechnicianIdsByLine: Record<string, string[]>;
  partRequestsByLine: Record<string, WorkOrderPartRequestRow[]>;
  partRequestsByQuoteLine: Record<string, WorkOrderPartRequestRow[]>;
};

export function emptyCanonicalWorkOrderLineContext(): CanonicalWorkOrderLineContext {
  return {
    allocationsByLine: {},
    canonicalPartsByLine: {},
    technicianIdsByLine: {},
    primaryTechnicianIdByLine: {},
    assignmentIssuesByLine: {},
    activeTechnicianIdsByLine: {},
    partRequestsByLine: {},
    partRequestsByQuoteLine: {},
  };
}

export function buildCanonicalWorkOrderLineContext(input: {
  lineIds: string[];
  allocations: WorkOrderAllocationRow[];
  canonicalParts: CanonicalWorkOrderPartRow[];
  technicians: WorkOrderLineTechnicianRow[];
  assignmentMirrors?: WorkOrderLineAssignmentMirrorRow[];
  activeLaborSegments: WorkOrderLineLaborSegmentRow[];
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

  for (const mirror of input.assignmentMirrors ?? []) {
    if (!lineIds.has(mirror.id)) continue;
    const assignment = resolveTechnicianAssignmentContract({
      primaryTechnicianId: mirror.assigned_tech_id,
      legacyAssignedTo: mirror.assigned_to,
      canonicalTechnicianIds: result.technicianIdsByLine[mirror.id],
    });
    result.technicianIdsByLine[mirror.id] = assignment.technicianIds;
    (result.primaryTechnicianIdByLine ??= {})[mirror.id] =
      assignment.primaryTechnicianId;
    if (assignment.issues.length > 0) {
      (result.assignmentIssuesByLine ??= {})[mirror.id] = assignment.issues;
    }
  }

  for (const segment of input.activeLaborSegments) {
    const lineId = segment.work_order_line_id;
    if (!lineIds.has(lineId) || segment.ended_at) continue;
    const ids = (result.activeTechnicianIdsByLine[lineId] ??= []);
    if (!ids.includes(segment.technician_id)) {
      ids.push(segment.technician_id);
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

export type PartsRequestDisplayState =
  | "none"
  | "pick_order"
  | "awaiting_approval"
  | "requested"
  | "handoff"
  | "history";

export function getPartsRequestDisplayState(
  requests: WorkOrderPartRequestRow[],
): PartsRequestDisplayState {
  if (requests.length === 0) return "none";
  const statuses = new Set(
    requests.map((request) =>
      String(request.status ?? "requested").toLowerCase(),
    ),
  );
  if (
    statuses.has("approved") ||
    statuses.has("partially_ordered") ||
    statuses.has("partially_consumed") ||
    statuses.has("partially_returned")
  ) {
    return "pick_order";
  }
  if (statuses.has("quoted")) return "awaiting_approval";
  if (statuses.has("requested")) return "requested";
  if (statuses.has("fulfilled")) return "handoff";
  return statuses.size > 0 ? "history" : "requested";
}

export function getPartsRequestStatusLabel(
  requests: WorkOrderPartRequestRow[],
): string | null {
  switch (getPartsRequestDisplayState(requests)) {
    case "none":
      return null;
    case "pick_order":
      return "Pick / order active";
    case "awaiting_approval":
      return "Awaiting approval";
    case "requested":
      return "Parts requested";
    case "handoff":
      return "Parts handed off";
    case "history":
      return "Parts history recorded";
  }
}

export function collectTechnicianIdsForLineContexts(
  contexts: Iterable<CanonicalWorkOrderLineContext>,
  primaryTechnicianIds: Iterable<string | null | undefined> = [],
): string[] {
  const technicianIds = new Set<string>();
  for (const technicianId of primaryTechnicianIds) {
    if (technicianId) technicianIds.add(technicianId);
  }
  for (const context of contexts) {
    for (const technicianId of Object.values(
      context.technicianIdsByLine,
    ).flat()) {
      technicianIds.add(technicianId);
    }
    for (const technicianId of Object.values(
      context.activeTechnicianIdsByLine ?? {},
    ).flat()) {
      technicianIds.add(technicianId);
    }
  }
  return [...technicianIds];
}

type PaginatedReadResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export async function loadRowsForIdChunks<T>(
  ids: string[],
  fetchPage: (
    chunkIds: string[],
    from: number,
    to: number,
  ) => PromiseLike<PaginatedReadResult<T>>,
  options: { idChunkSize?: number; pageSize?: number } = {},
): Promise<T[]> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const idChunkSize = Math.max(1, options.idChunkSize ?? 100);
  const pageSize = Math.max(1, options.pageSize ?? 500);
  const rows: T[] = [];

  for (
    let chunkStart = 0;
    chunkStart < uniqueIds.length;
    chunkStart += idChunkSize
  ) {
    const chunkIds = uniqueIds.slice(chunkStart, chunkStart + idChunkSize);
    for (let from = 0; ; from += pageSize) {
      const result = await fetchPage(chunkIds, from, from + pageSize - 1);
      if (result.error) throw new Error(result.error.message);
      const page = result.data ?? [];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
  }

  return rows;
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

  const [
    allocations,
    canonicalParts,
    technicians,
    assignmentMirrors,
    activeLaborSegments,
    partRequests,
  ] = await Promise.all([
    loadRowsForIdChunks<WorkOrderAllocationRow>(
      lineIds,
      (ids, from, to) =>
        input.supabase
          .from("work_order_part_allocations")
          .select("*, parts(name)")
          .eq("shop_id", input.shopId)
          .in("work_order_line_id", ids)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to) as unknown as PromiseLike<
          PaginatedReadResult<WorkOrderAllocationRow>
        >,
    ),
    loadRowsForIdChunks<CanonicalWorkOrderPartRow>(
      lineIds,
      (ids, from, to) =>
        input.supabase
          .from("work_order_parts")
          .select("*, parts(name, sku, part_number, manufacturer, supplier)")
          .eq("shop_id", input.shopId)
          .eq("is_active", true)
          .in("work_order_line_id", ids)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to) as unknown as PromiseLike<
          PaginatedReadResult<CanonicalWorkOrderPartRow>
        >,
    ),
    loadRowsForIdChunks<WorkOrderLineTechnicianRow>(lineIds, (ids, from, to) =>
      input.supabase
        .from("work_order_line_technicians")
        .select("work_order_line_id, technician_id")
        .in("work_order_line_id", ids)
        .order("work_order_line_id", { ascending: true })
        .order("technician_id", { ascending: true })
        .range(from, to),
    ),
    loadRowsForIdChunks<WorkOrderLineAssignmentMirrorRow>(
      lineIds,
      (ids, from, to) =>
        input.supabase
          .from("work_order_lines")
          .select("id, assigned_tech_id, assigned_to")
          .eq("shop_id", input.shopId)
          .in("id", ids)
          .order("id", { ascending: true })
          .range(from, to),
    ),
    loadRowsForIdChunks<WorkOrderLineLaborSegmentRow>(
      lineIds,
      (ids, from, to) =>
        input.supabase
          .from("work_order_line_labor_segments")
          .select("work_order_line_id, technician_id, ended_at")
          .eq("shop_id", input.shopId)
          .is("ended_at", null)
          .in("work_order_line_id", ids)
          .order("started_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    ),
    loadRowsForIdChunks<WorkOrderPartRequestRow>(
      workOrderIds,
      (ids, from, to) =>
        input.supabase
          .from("part_requests")
          .select("id, work_order_id, quote_line_id, job_id, status")
          .eq("shop_id", input.shopId)
          .in("work_order_id", ids)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    ),
  ]);

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
          assignmentMirrors: assignmentMirrors.filter((row) =>
            scopedLineIds.has(row.id),
          ),
          activeLaborSegments: activeLaborSegments.filter((row) =>
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
    workOrders: [{ workOrderId: input.workOrderId, lineIds: input.lineIds }],
  });
  return (
    contexts.get(input.workOrderId) ?? emptyCanonicalWorkOrderLineContext()
  );
}
