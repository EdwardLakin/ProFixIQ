import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/features/shared/types/types/supabase";
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
type SharedAssignment = { work_order_line_id: string };
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
  "id" | "work_order_id" | "complaint"
>;

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
  const technicianIds = uniqueIds(input.technicianIds);
  if (!input.shopId || technicianIds.length === 0) return [];

  // Assignment history can grow indefinitely for a long-tenured technician.
  // Page every assignment read deterministically instead of relying on the
  // PostgREST response-row cap, and chunk downstream identity filters so a
  // lifetime history never becomes one oversized `.in(...)` request.
  const [directAssignments, sharedAssignments] = await Promise.all([
    loadRowsForIdChunks<AssignedLine>(
      technicianIds,
      (ids, from, to) =>
        input.supabase
          .from("work_order_lines")
          .select("id,work_order_id")
          .eq("shop_id", input.shopId)
          .eq("line_type", "job")
          .or(directAssignmentFilter(ids))
          .order("id", { ascending: true })
          .range(from, to),
      { idChunkSize: 25, pageSize: 250 },
    ),
    loadRowsForIdChunks<SharedAssignment>(
      technicianIds,
      (ids, from, to) =>
        input.supabase
          .from("work_order_line_technicians")
          .select("work_order_line_id")
          .in("technician_id", ids)
          .order("work_order_line_id", { ascending: true })
          .range(from, to),
      { idChunkSize: 25, pageSize: 250 },
    ),
  ]);

  const sharedLineIds = uniqueIds(
    sharedAssignments.map((row) => row.work_order_line_id),
  );
  const sharedLines = await loadRowsForIdChunks<AssignedLine>(
    sharedLineIds,
    (ids, from, to) =>
      input.supabase
        .from("work_order_lines")
        .select("id,work_order_id")
        .eq("shop_id", input.shopId)
        .eq("line_type", "job")
        .in("id", ids)
        .order("id", { ascending: true })
        .range(from, to),
    { idChunkSize: 100, pageSize: 250 },
  );

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
        .select(
          "id,custom_id,status,notes,intake_json,vehicle_year,vehicle_make,vehicle_model,vehicle_vin,vehicle_unit_number,updated_at",
        )
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
        .select("id,work_order_id,complaint")
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
        lineIds: linesForOrder.assignedIds,
        lineComplaints: [...new Set(linesForOrder.complaints)],
      } satisfies TechnicianWorkCandidate;
    })
    .filter((candidate) => candidate.lineIds.length > 0);
}
