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
  lineIds: string[];
  lineComplaints: string[];
};

export async function listTechnicianWorkCandidates(supabase: SupabaseClient<Database>): Promise<TechnicianWorkCandidate[]> {
  const workOrders = await supabase
    .from("work_orders")
    .select("id,custom_id,status,customer_concern,description,vehicle_year,vehicle_make,vehicle_model,vehicle_vin,vehicle_unit_number,updated_at")
    .order("updated_at", { ascending: false })
    .limit(30);
  if (workOrders.error) throw new Error(workOrders.error.message);
  const rows = workOrders.data ?? [];
  if (!rows.length) return [];

  const lines = await supabase.from("work_order_lines").select("id,work_order_id,complaint").in("work_order_id", rows.map((row) => row.id));
  if (lines.error) throw new Error(lines.error.message);

  const byWorkOrder = new Map<string, { ids: string[]; complaints: string[] }>();
  for (const line of lines.data ?? []) {
    const value = byWorkOrder.get(line.work_order_id) ?? { ids: [], complaints: [] };
    value.ids.push(line.id);
    if (line.complaint?.trim()) value.complaints.push(line.complaint.trim());
    byWorkOrder.set(line.work_order_id, value);
  }

  return rows.map((row) => {
    const linesForOrder = byWorkOrder.get(row.id) ?? { ids: [], complaints: [] };
    return {
      id: row.id,
      customId: row.custom_id,
      status: row.status,
      concern: row.customer_concern,
      description: row.description,
      vehicleYear: row.vehicle_year,
      vehicleMake: row.vehicle_make,
      vehicleModel: row.vehicle_model,
      vehicleVin: row.vehicle_vin,
      vehicleUnitNumber: row.vehicle_unit_number,
      lineIds: linesForOrder.ids,
      lineComplaints: linesForOrder.complaints,
    };
  });
}
