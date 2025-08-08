// lib/work-orders/getQueuedJobsForTech.ts

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type JobLine = Database["public"]["Tables"]["work_order_lines"]["Row"] & {
  vehicle?: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
  };
  assigned_to?: {
    full_name?: string | null;
  };
};

export async function getQueuedJobsForTech(): Promise<JobLine[]> {
  const supabase = createClientComponentClient<Database>();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.warn("No authenticated user found");
    return [];
  }

  const { data, error } = await supabase
    .from("work_order_lines")
    .select(
      `
      *,
      vehicles (
        year,
        make,
        model
      ),
      profiles:assigned_to (
        full_name
      )
    `,
    )
    .eq("status", "queued")
    .or(`assigned_to.eq.${user.id},assigned_to.is.null`)
    .order("created_at", { ascending: true });

  if (error || !data) {
    console.error("❌ Error fetching queued jobs for tech:", error);
    return [];
  }

  const jobLines: JobLine[] = data.map(
    (row): JobLine => ({
      ...row,
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
    }),
  );

  return jobLines;
}
