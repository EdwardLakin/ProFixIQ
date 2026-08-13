import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/features/shared/types/types/supabase";

export async function hasTechnicianCopilotTextCapability(
  supabase: SupabaseClient<Database>,
  shopId: string,
  technicianId: string,
): Promise<boolean> {
  const names = ["technician_copilot_text", `technician_copilot_text:${technicianId}`];
  const result = await supabase
    .from("ai_automation_capability_settings")
    .select("enabled")
    .eq("shop_id", shopId)
    .in("capability", names);
  return !result.error && (result.data ?? []).some((row) => row.enabled === true);
}
