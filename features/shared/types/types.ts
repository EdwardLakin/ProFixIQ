"use client";

import { supabaseBrowser } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

// Shape of the joined row we get back from Supabase for this query
type WorkOrderLineWithJoins =
  Database["public"]["Tables"]["work_order_lines"]["Row"] & {
    vehicles?: { year: number | null; make: string | null; model: string | null } | null;
    profiles?: { full_name: string | null } | null;
  };

// Public JobLine shape that UI code consumes
type JobLine = {
  id: string;
  status: Database["public"]["Tables"]["work_order_lines"]["Row"]["status"];
  complaint: string | null;
  punched_in_at: string | null;
  punched_out_at: string | null;
  hold_reason: string | null;
  created_at: string;
  vehicle?: { year: number | null; make: string | null; model: string | null };
  assigned_tech_id?: { full_name: string | null };
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
  profiles:assigned_tech_id ( full_name )
`;

export async function fetchAllJobLines(): Promise<JobLine[]> {
  const supabase = supabaseBrowser;

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
      ? { year: row.vehicles.year ?? null, make: row.vehicles.make ?? null, model: row.vehicles.model ?? null }
      : undefined,
    assigned_tech_id: row.profiles ? { full_name: row.profiles.full_name ?? null } : undefined,
  }));
}