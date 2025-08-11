import { supabase } from "@lib/supabase/client";
import { JobLine } from "@shared/types/types/supabase";

export async function getQueuedJobsForTech(): Promise<JobLine[]> {
  const { data, error } = await supabase
    .from("work_order_lines")
    .select("*")
    .eq("status", "queued") // adjust as needed
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch tech queue:", error);
    return [];
  }

  return data as JobLine[];
}
