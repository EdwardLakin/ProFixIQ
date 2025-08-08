// features/work-orders/lib/work-orders/fetchJobs.ts

import { createBrowserClient } from "@supabase/ssr";
import type { Database, JobLine } from "@shared/types/types/supabase";

// Shape of the joined row we get back from Supabase for this query
type WorkOrderLineWithJoins =
  Database["public"]["Tables"]["work_order_lines"]["Row"] & {
    // join vehicles on vehicle_id
    vehicles?: {
      year: number | null;
      make: string | null;
      model: string | null;
    } | null;
    // join profiles on assigned_to
    profiles?: {
      full_name: string | null;
    } | null;
  };

// Reusable select with the two joins we need
const SELECT_WITH_JOINS = `
  id,
  status,
  complaint,
  punched_in_at,
  punched_out_at,
  hold_reason,
  created_at,
  vehicles:vehicle_id ( year, make, model ),
  profiles:assigned_to ( full_name )
`;

export async function fetchAllJobLines(): Promise<JobLine[]> {
  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data, error } = await supabase
    .from("work_order_lines")
    .select(SELECT_WITH_JOINS)
    .order("created_at", { ascending: true });

  if (error || !data) {
    console.error("❌ Error fetching job lines:", error);
    return [];
  }

  const rows = data as unknown as WorkOrderLineWithJoins[];

  return rows.map((row): JobLine => ({
    id: row.id!,
    status: row.status!,
    complaint: row.complaint ?? null,
    punched_in_at: row.punched_in_at ?? null,
    punched_out_at: row.punched_out_at ?? null,
    hold_reason: row.hold_reason ?? null,
    created_at: row.created_at!,
    vehicle: row.vehicles
      ? {
          year: row.vehicles.year ?? null,
          make: row.vehicles.make ?? null,
          model: row.vehicles.model ?? null,
        }
      : undefined,
    assigned_to: row.profiles
      ? {
          full_name: row.profiles.full_name ?? null,
        }
      : undefined,
  }));
}