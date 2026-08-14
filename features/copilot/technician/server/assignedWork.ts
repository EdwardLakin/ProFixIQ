import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/features/shared/types/types/supabase";
import {
  getWorkOrderLineStatusDbFilter,
  type WorkOrderLineStatus,
} from "@/features/work-orders/lib/line-status";

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
  /** Only active job line IDs canonically assigned to this technician. */
  lineIds: string[];
  /** Readable complaints on the assigned work order for conversational context. */
  lineComplaints: string[];
};

export type TechnicianWorkScope = {
  supabase: SupabaseClient<Database>;
  shopId: string;
  technicianIds: string[];
};

type AssignedLine = {
  id: string;
  work_order_id: string;
  created_at?: string | null;
};

type SharedAssignmentRow = {
  id: string;
  work_order_line_id: string;
  assigned_at: string | null;
  work_order_lines: AssignedLine | AssignedLine[] | null;
};

type WorkOrderCandidateRow = {
  id: string;
  custom_id: string | null;
  status: string | null;
  notes: string | null;
  intake_json: unknown;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_vin: string | null;
  vehicle_unit_number: string | null;
  updated_at: string | null;
};

type ComplaintLine = {
  id: string;
  work_order_id: string;
  complaint: string | null;
};

const ACTIVE_CANONICAL_LINE_STATUSES = [
  "pending",
  "approved",
  "awaiting",
  "awaiting_approval",
  "in_progress",
  "waiting_parts",
  "on_hold",
] as const satisfies readonly WorkOrderLineStatus[];

export const ACTIVE_TECHNICIAN_LINE_DB_STATUSES =
  getWorkOrderLineStatusDbFilter(ACTIVE_CANONICAL_LINE_STATUSES);

const TERMINAL_WORK_ORDER_STATUSES = [
  "completed",
  "ready_to_invoice",
  "invoiced",
  "cancelled",
  "canceled",
  "closed",
  "paid",
  "void",
  "voided",
  "archived",
] as const;

const MAX_ASSIGNED_LINES_PER_PATH = 250;
const MAX_WORK_ORDER_CANDIDATES = 30;

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

function embeddedAssignedLine(row: SharedAssignmentRow): AssignedLine | null {
  const relation = row.work_order_lines;
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

function buildCandidate(
  row: WorkOrderCandidateRow,
  assignedLineIds: readonly string[],
  complaints: readonly string[],
): TechnicianWorkCandidate {
  return {
    id: row.id,
    customId: row.custom_id,
    status: row.status,
    concern: readCanonicalWorkOrderConcern(row.intake_json),
    description: text(row.notes),
    vehicleYear: row.vehicle_year,
    vehicleMake: row.vehicle_make,
    vehicleModel: row.vehicle_model,
    vehicleVin: row.vehicle_vin,
    vehicleUnitNumber: row.vehicle_unit_number,
    lineIds: uniqueIds(assignedLineIds),
    lineComplaints: [...new Set(complaints.map((value) => value.trim()).filter(Boolean))],
  };
}

async function collectAssignedLines(
  input: TechnicianWorkScope,
  workOrderId?: string | null,
): Promise<AssignedLine[]> {
  const technicianIds = uniqueIds(input.technicianIds);
  if (!input.shopId || technicianIds.length === 0) return [];

  let directQuery = input.supabase
    .from("work_order_lines")
    .select("id,work_order_id,created_at")
    .eq("shop_id", input.shopId)
    .eq("line_type", "job")
    .in("status", ACTIVE_TECHNICIAN_LINE_DB_STATUSES)
    .or(directAssignmentFilter(technicianIds))
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MAX_ASSIGNED_LINES_PER_PATH);

  let sharedQuery = input.supabase
    .from("work_order_line_technicians")
    .select(
      "id,work_order_line_id,assigned_at,work_order_lines!inner(id,work_order_id,created_at,shop_id,line_type,status)",
    )
    .in("technician_id", technicianIds)
    .eq("work_order_lines.shop_id", input.shopId)
    .eq("work_order_lines.line_type", "job")
    .in("work_order_lines.status", ACTIVE_TECHNICIAN_LINE_DB_STATUSES)
    .order("assigned_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MAX_ASSIGNED_LINES_PER_PATH);

  if (workOrderId) {
    directQuery = directQuery.eq("work_order_id", workOrderId);
    sharedQuery = sharedQuery.eq("work_order_lines.work_order_id", workOrderId);
  }

  const [directResult, sharedResult] = await Promise.all([
    directQuery,
    sharedQuery,
  ]);

  if (directResult.error) throw new Error(directResult.error.message);
  if (sharedResult.error) throw new Error(sharedResult.error.message);

  const assignedById = new Map<string, AssignedLine>();
  for (const line of (directResult.data ?? []) as AssignedLine[]) {
    assignedById.set(line.id, line);
  }

  for (const row of (sharedResult.data ?? []) as unknown as SharedAssignmentRow[]) {
    const line = embeddedAssignedLine(row);
    if (line) assignedById.set(line.id, line);
  }

  return [...assignedById.values()];
}

async function loadComplaintLines(
  input: TechnicianWorkScope,
  workOrderIds: readonly string[],
): Promise<ComplaintLine[]> {
  if (workOrderIds.length === 0) return [];

  const result = await input.supabase
    .from("work_order_lines")
    .select("id,work_order_id,complaint")
    .eq("shop_id", input.shopId)
    .eq("line_type", "job")
    .in("work_order_id", [...workOrderIds]);

  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as ComplaintLine[];
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

export async function listTechnicianWorkCandidates(
  input: TechnicianWorkScope,
): Promise<TechnicianWorkCandidate[]> {
  const assignedLines = await collectAssignedLines(input);
  if (assignedLines.length === 0) return [];

  const workOrderIds = uniqueIds(
    assignedLines.map((line) => line.work_order_id),
  );
  const workOrders = await input.supabase
    .from("work_orders")
    .select(
      "id,custom_id,status,notes,intake_json,vehicle_year,vehicle_make,vehicle_model,vehicle_vin,vehicle_unit_number,updated_at",
    )
    .eq("shop_id", input.shopId)
    .in("id", workOrderIds)
    .not("status", "in", `(${TERMINAL_WORK_ORDER_STATUSES.join(",")})`)
    .or("type.neq.historical_import,type.is.null")
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MAX_WORK_ORDER_CANDIDATES);

  if (workOrders.error) throw new Error(workOrders.error.message);
  const rows = (workOrders.data ?? []) as WorkOrderCandidateRow[];
  if (!rows.length) return [];

  const visibleWorkOrderIds = rows.map((row) => row.id);
  const lines = await loadComplaintLines(input, visibleWorkOrderIds);
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
      return buildCandidate(
        row,
        linesForOrder.assignedIds,
        linesForOrder.complaints,
      );
    })
    .filter((candidate) => candidate.lineIds.length > 0);
}

export async function loadTechnicianWorkCandidateForWorkOrder(
  input: TechnicianWorkScope & { workOrderId: string },
): Promise<TechnicianWorkCandidate | null> {
  const workOrderId = input.workOrderId.trim();
  if (!workOrderId) return null;

  const assignedLines = await collectAssignedLines(input, workOrderId);
  if (assignedLines.length === 0) return null;

  const workOrderResult = await input.supabase
    .from("work_orders")
    .select(
      "id,custom_id,status,notes,intake_json,vehicle_year,vehicle_make,vehicle_model,vehicle_vin,vehicle_unit_number,updated_at",
    )
    .eq("shop_id", input.shopId)
    .eq("id", workOrderId)
    .not("status", "in", `(${TERMINAL_WORK_ORDER_STATUSES.join(",")})`)
    .or("type.neq.historical_import,type.is.null")
    .maybeSingle();

  if (workOrderResult.error) throw new Error(workOrderResult.error.message);
  if (!workOrderResult.data) return null;

  const complaintLines = await loadComplaintLines(input, [workOrderId]);
  const assignedLineIds = new Set(assignedLines.map((line) => line.id));
  const assignedIds: string[] = [];
  const complaints: string[] = [];

  for (const line of complaintLines) {
    if (assignedLineIds.has(line.id)) assignedIds.push(line.id);
    if (line.complaint?.trim()) complaints.push(line.complaint.trim());
  }

  const candidate = buildCandidate(
    workOrderResult.data as WorkOrderCandidateRow,
    assignedIds,
    complaints,
  );
  return candidate.lineIds.length > 0 ? candidate : null;
}
