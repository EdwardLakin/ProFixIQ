import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

type JobLine = Database["public"]["Tables"]["work_order_lines"]["Row"];

export async function getQueuedJobsForTech(): Promise<JobLine[]> {
  const supabase = createBrowserSupabase();

  const { data, error } = await supabase
    .from("work_order_lines")
    .select("*")
    .eq("status", "queued") // adjust if you want multiple statuses
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch tech queue:", error.message);
    return [];
  }

  return data ?? [];
}