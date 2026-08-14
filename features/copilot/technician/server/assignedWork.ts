import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/features/shared/types/types/supabase";

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

  // Discover assignment identity first. This intentionally mirrors the
  // canonical technician work surfaces instead of asking for the newest shop
  // work orders and assuming RLS alone defines the candidate list.
  const [directResult, sharedResult] = await Promise.all([
    input.supabase
      .from("work_order_lines")
      .select("id,work_order_id")
      .eq("shop_id", input.shopId)
      .eq("line_type", "job")
      .or(directAssignmentFilter(technicianIds)),
    input.supabase
      .from("work_order_line_technicians")
      .select("work_order_line_id")
      .in("technician_id", technicianIds),
  ]);

  if (directResult.error) throw new Error(directResult.error.message);
  if (sharedResult.error) throw new Error(sharedResult.error.message);

  const sharedLineIds = uniqueIds(
    (sharedResult.data ?? []).map((row) => row.work_order_line_id),
  );

  let sharedLines: AssignedLine[] = [];
  if (sharedLineIds.length > 0) {
    const sharedLinesResult = await input.supabase
      .from("work_order_lines")
      .select("id,work_order_id")
      .eq("shop_id", input.shopId)
      .eq("line_type", "job")
      .in("id", sharedLineIds);
    if (sharedLinesResult.error) throw new Error(sharedLinesResult.error.message);
    sharedLines = sharedLinesResult.data ?? [];
  }

  const assignedById = new Map<string, AssignedLine>();
  for (const row of [...(directResult.data ?? []), ...sharedLines]) {
    assignedById.set(row.id, row);
  }
  const assignedLines = [...assignedById.values()];
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
    .or("type.neq.historical_import,type.is.null")
    .order("updated_at", { ascending: false })
    .limit(30);
  if (workOrders.error) throw new Error(workOrders.error.message);
  const rows = workOrders.data ?? [];
  if (!rows.length) return [];

  const visibleWorkOrderIds = rows.map((row) => row.id);
  const lines = await input.supabase
    .from("work_order_lines")
    .select("id,work_order_id,complaint")
    .eq("shop_id", input.shopId)
    .eq("line_type", "job")
    .in("work_order_id", visibleWorkOrderIds);
  if (lines.error) throw new Error(lines.error.message);

  const assignedLineIds = new Set(assignedLines.map((line) => line.id));
  const byWorkOrder = new Map<
    string,
    { assignedIds: string[]; complaints: string[] }
  >();
  for (const line of lines.data ?? []) {
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
