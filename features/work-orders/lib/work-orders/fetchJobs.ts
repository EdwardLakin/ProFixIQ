import { createBrowserSupabase } from "@shared/lib/supabase/client";
import type { Database, JobLine } from "@shared/types/types/supabase";

// Type for joined results
type WorkOrderLineWithJoins =
  Database["public"]["Tables"]["work_order_lines"]["Row"] & {
    vehicles?: {
      year: number | null;
      make: string | null;
      model: string | null;
    } | null;
    profiles?: {
      full_name: string | null;
    } | null;
  };

export async function fetchAllJobLines(): Promise<JobLine[]> {
  const supabase = createBrowserSupabase();

  const { data, error } = await supabase
    .from("work_order_lines")
    .select(`
      id,
      status,
      complaint,
      punched_in_at,
      punched_out_at,
      hold_reason,
      created_at,
      vehicles:vehicle_id ( year, make, model ),
      profiles:assigned_to ( full_name )
    `)
    .order("created_at", { ascending: true });

  if (error || !data) {
    console.error("❌ Error fetching job lines:", error);
    return [];
  }

  const rows = data as unknown as WorkOrderLineWithJoins[];

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    complaint: row.complaint,
    punched_in_at: row.punched_in_at,
    punched_out_at: row.punched_out_at,
    hold_reason: row.hold_reason,
    created_at: row.created_at,
    vehicle: row.vehicles
      ? {
          year: row.vehicles.year,
          make: row.vehicles.make,
          model: row.vehicles.model,
        }
      : undefined,
    assigned_to: row.profiles
      ? {
          full_name: row.profiles.full_name,
        }
      : undefined,
  }));
}