import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/features/shared/types/types/supabase";
import {
  getWorkOrderLineStatusDbFilter,
  type WorkOrderLineStatus,
} from "@/features/work-orders/lib/line-status";
import { loadRowsForIdChunks } from "@/features/work-orders/lib/data/loadCanonicalWorkOrderLineContext";

export type TechnicianWorkCandidate = {
  id: string;
  customId: string | null;
  status: string | null;
  concern: string | null;
  description: string | null;
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleVin: string | null;
  vehicleUnitNumber: string | null;
  /** Only line IDs canonically assigned to this technician. */
  lineIds: string[];
  /** Readable complaints on the assigned work order for conversational context. */
  lineComplaints: string[];
};

export type TechnicianWorkScope = {
  supabase: SupabaseClient<Database>;
  shopId: string;
  technicianIds: string[];
};

type AssignedLine = { id: string; work_order_id: string };
type SharedAssignment = {
  work_order_line_id: string;
  technician_id: string;
};
type ActiveSharedAssignmentRow = {
  work_order_line_id: string;
  technician_id: string;
  assigned_at: string | null;
  work_order_lines:
    | { id: string; work_order_id: string }
    | Array<{ id: string; work_order_id: string }>
    | null;
};
type WorkOrderCandidateRow = Pick<
  Database["public"]["Tables"]["work_orders"]["Row"],
  | "id"
  | "custom_id"
  | "status"
  | "notes"
  | "intake_json"
  | "vehicle_year"
  | "vehicle_make"
  | "vehicle_model"
  | "vehicle_vin"
  | "vehicle_unit_number"
  | "updated_at"
>;
type WorkOrderLineSummary = Pick<
  Database["public"]["Tables"]["work_order_lines"]["Row"],
  | "id"
  | "work_order_id"
  | "complaint"
  | "assigned_tech_id"
  | "assigned_to"
>;

const WORK_ORDER_SELECT =
  "id,custom_id,status,notes,intake_json,vehicle_year,vehicle_make,vehicle_model,vehicle_vin,vehicle_unit_number,updated_at" as const;
const ACTIVE_CANONICAL_LINE_STATUSES: readonly WorkOrderLineStatus[] = [
  "pending",
  "approved",
  "awaiting",
  "awaiting_approval",
  "in_progress",
  "waiting_parts",
  "on_hold",
];
const ACTIVE_LINE_DB_STATUSES = getWorkOrderLineStatusDbFilter(
  ACTIVE_CANONICAL_LINE_STATUSES,
);
const PRESESSION_ASSIGNMENT_LIMIT = 250;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function uniqueIds(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function directAssignmentFilter(technicianIds: readonly string[]): string {
  return technicianIds
    .flatMap((technicianId) => [
      `assigned_tech_id.eq.${technicianId}`,
      `assigned_to.eq.${technicianId}`,
    ])
    .join(",");
}

function timestamp(value: string | null): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function sharedLine(
  value: ActiveSharedAssignmentRow["work_order_lines"],
): AssignedLine | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row?.id || !row.work_order_id) return null;
  return { id: row.id, work_order_id: row.work_order_id };
}

function buildCandidate(input: {
  row: WorkOrderCandidateRow;
  assignedLineIds: Iterable<string>;
  complaints: Iterable<string>;
}): TechnicianWorkCandidate {
  return {
    id: input.row.id,
    customId: input.row.custom_id,
    status: input.row.status,
    concern: readCanonicalWorkOrderConcern(input.row.intake_json),
    description: text(input.row.notes),
    vehicleYear: input.row.vehicle_year,
    vehicleMake: input.row.vehicle_make,
    vehicleModel: input.row.vehicle_model,
    vehicleVin: input.row.vehicle_vin,
    vehicleUnitNumber: input.row.vehicle_unit_number,
    lineIds: uniqueIds([...input.assignedLineIds]),
    lineComplaints: [
      ...new Set([...input.complaints].map((value) => value.trim()).filter(Boolean)),
    ],
  };
}

export function readCanonicalWorkOrderConcern(intakeJson: unknown): string | null {
  const intake = object(intakeJson);
  const concern = object(intake?.concern);
  if (!concern) return null;

  const values = [text(concern.primary_text), text(concern.additional_text)].filter(
    (value): value is string => Boolean(value),
  );

  return values.length ? [...new Set(values)].join(" | ") : null;
}

async function collectActiveSharedLines(input: {
  supabase: TechnicianWorkScope["supabase"];
  shopId: string;
  technicianIds: string[];
}): Promise<AssignedLine[]> {
  // The !inner relation applies canonical active-line filters inside PostgREST
  // before LIMIT, so years of completed assignment mappings cannot turn a cold
  // "What do I have?" request into an unbounded history scan.
  const { data, error } = await input.supabase
    .from("work_order_line_technicians")
    .select(
      "work_order_line_id,technician_id,assigned_at,work_order_lines!inner(id,work_order_id)",
    )
    .in("technician_id", input.technicianIds)
    .eq("work_order_lines.shop_id", input.shopId)
    .eq("work_order_lines.line_type", "job")
    .in("work_order_lines.status", ACTIVE_LINE_DB_STATUSES)
    .order("assigned_at", { ascending: false })
    .order("work_order_line_id", { ascending: false })
    .order("technician_id", { ascending: false })
    .limit(PRESESSION_ASSIGNMENT_LIMIT);
  if (error) throw new Error(error.message);

  const byId = new Map<string, AssignedLine>();
  for (const row of (data ?? []) as unknown as ActiveSharedAssignmentRow[]) {
    const line = sharedLine(row.work_order_lines);
    if (line) byId.set(line.id, line);
  }
  return [...byId.values()];
}

/**
 * Loads only the active Repair Session's work order. `session.read` already
 * rechecks assignment in the private CoPilot boundary; this targeted loader
 * keeps conversational context current without rescanning assignment history.
 */
export async function loadTechnicianWorkCandidateForWorkOrder(
  input: TechnicianWorkScope & { workOrderId: string },
): Promise<TechnicianWorkCandidate | null> {
  const technicianIds = uniqueIds(input.technicianIds);
  if (!input.shopId || technicianIds.length === 0 || !input.workOrderId) {
    return null;
  }
  const technicianIdSet = new Set(technicianIds);

  const lines = await loadRowsForIdChunks<WorkOrderLineSummary>(
    [input.workOrderId],
    (workOrderIds, from, to) =>
      input.supabase
        .from("work_order_lines")
        .select("id,work_order_id,complaint,assigned_tech_id,assigned_to")
        .eq("shop_id", input.shopId)
        .eq("line_type", "job")
        .in("work_order_id", workOrderIds)
        .order("id", { ascending: true })
        .range(from, to),
    { idChunkSize: 1, pageSize: 250 },
  );
  if (!lines.length) return null;

  const lineIds = lines.map((line) => line.id);
  const sharedAssignments = await loadRowsForIdChunks<SharedAssignment>(
    lineIds,
    (ids, from, to) =>
      input.supabase
        .from("work_order_line_technicians")
        .select("work_order_line_id,technician_id")
        .in("work_order_line_id", ids)
        .in("technician_id", technicianIds)
        .order("work_order_line_id", { ascending: true })
        .order("technician_id", { ascending: true })
        .range(from, to),
    { idChunkSize: 100, pageSize: 250 },
  );
  const sharedLineIds = new Set(
    sharedAssignments.map((row) => row.work_order_line_id),
  );

  const assignedLineIds = lines
    .filter(
      (line) =>
        (line.assigned_tech_id && technicianIdSet.has(line.assigned_tech_id)) ||
        (line.assigned_to && technicianIdSet.has(line.assigned_to)) ||
        sharedLineIds.has(line.id),
    )
    .map((line) => line.id);
  if (!assignedLineIds.length) return null;

  const workOrder = await input.supabase
    .from("work_orders")
    .select(WORK_ORDER_SELECT)
    .eq("shop_id", input.shopId)
    .eq("id", input.workOrderId)
    .or("type.neq.historical_import,type.is.null")
    .maybeSingle();
  if (workOrder.error) throw new Error(workOrder.error.message);
  if (!workOrder.data) return null;

  return buildCandidate({
    row: workOrder.data,
    assignedLineIds,
    complaints: lines
      .map((line) => line.complaint?.trim() ?? "")
      .filter(Boolean),
  });
}

/**
 * Bounded pre-session discovery for natural questions such as "What have I
 * got?". Direct and shared assignments are both filtered to canonical active
 * job statuses before their 250-row caps. Established Repair Sessions never use
 * this discovery path.
 */
export async function listTechnicianWorkCandidates(
  input: TechnicianWorkScope,
): Promise<TechnicianWorkCandidate[]> {
  const technicianIds = uniqueIds(input.technicianIds);
  if (!input.shopId || technicianIds.length === 0) return [];

  const [directResult, sharedLines] = await Promise.all([
    input.supabase
      .from("work_order_lines")
      .select("id,work_order_id")
      .eq("shop_id", input.shopId)
      .eq("line_type", "job")
      .in("status", ACTIVE_LINE_DB_STATUSES)
      .or(directAssignmentFilter(technicianIds))
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PRESESSION_ASSIGNMENT_LIMIT),
    collectActiveSharedLines({
      supabase: input.supabase,
      shopId: input.shopId,
      technicianIds,
    }),
  ]);
  if (directResult.error) throw new Error(directResult.error.message);

  const directAssignments = directResult.data ?? [];
  const assignedById = new Map<string, AssignedLine>();
  for (const row of [...directAssignments, ...sharedLines]) {
    assignedById.set(row.id, row);
  }
  const assignedLines = [...assignedById.values()];
  if (assignedLines.length === 0) return [];

  const workOrderIds = uniqueIds(
    assignedLines.map((line) => line.work_order_id),
  );
  const allWorkOrders = await loadRowsForIdChunks<WorkOrderCandidateRow>(
    workOrderIds,
    (ids, from, to) =>
      input.supabase
        .from("work_orders")
        .select(WORK_ORDER_SELECT)
        .eq("shop_id", input.shopId)
        .in("id", ids)
        .or("type.neq.historical_import,type.is.null")
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    { idChunkSize: 100, pageSize: 100 },
  );

  const rows = allWorkOrders
    .sort(
      (left, right) =>
        timestamp(right.updated_at) - timestamp(left.updated_at) ||
        right.id.localeCompare(left.id),
    )
    .slice(0, 30);
  if (!rows.length) return [];

  const visibleWorkOrderIds = rows.map((row) => row.id);
  const lines = await loadRowsForIdChunks<WorkOrderLineSummary>(
    visibleWorkOrderIds,
    (ids, from, to) =>
      input.supabase
        .from("work_order_lines")
        .select("id,work_order_id,complaint,assigned_tech_id,assigned_to")
        .eq("shop_id", input.shopId)
        .eq("line_type", "job")
        .in("work_order_id", ids)
        .order("id", { ascending: true })
        .range(from, to),
    { idChunkSize: 30, pageSize: 250 },
  );

  const assignedLineIds = new Set(assignedLines.map((line) => line.id));
  const byWorkOrder = new Map<
    string,
    { assignedIds: string[]; complaints: string[] }
  >();
  for (const line of lines) {
    const value = byWorkOrder.get(line.work_order_id) ?? {
      assignedIds: [],
      complaints: [],
    };
    if (assignedLineIds.has(line.id)) value.assignedIds.push(line.id);
    if (line.complaint?.trim()) value.complaints.push(line.complaint.trim());
    byWorkOrder.set(line.work_order_id, value);
  }

  return rows
    .map((row) => {
      const linesForOrder = byWorkOrder.get(row.id) ?? {
        assignedIds: [],
        complaints: [],
      };
      return buildCandidate({
        row,
        assignedLineIds: linesForOrder.assignedIds,
        complaints: linesForOrder.complaints,
      });
    })
    .filter((candidate) => candidate.lineIds.length > 0);
}
