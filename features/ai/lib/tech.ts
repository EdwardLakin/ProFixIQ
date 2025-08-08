import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * Fetch queued jobs assigned to the logged-in technician.
 */
export async function getQueuedJobsForTech() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("work_order_lines")
    .select(
      `
      id,
      status,
      complaint,
      vehicle:vehicles (
        year,
        make,
        model
      ),
      assigned_tech:profiles (
        full_name
      ),
      punched_in_at,
      punched_out_at,
      hold_reason,
      work_order_id
    `,
    )
    .eq("assigned_tech_id", user.id)
    .in("status", ["awaiting", "in_progress", "on_hold"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch tech jobs:", error);
    return [];
  }

  return data;
}
