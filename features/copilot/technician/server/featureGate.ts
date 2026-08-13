import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/features/shared/types/types/supabase";

export const TECHNICIAN_COPILOT_TEXT_CAPABILITY = "technician_copilot_text";

export async function isTechnicianCopilotTextEnabled(input: {
  supabase: SupabaseClient<Database>;
  shopId: string;
  technicianId: string;
}): Promise<boolean> {
  const scopedCapability = `${TECHNICIAN_COPILOT_TEXT_CAPABILITY}:${input.technicianId}`;
  const { data, error } = await input.supabase
    .from("ai_automation_capability_settings")
    .select("capability,enabled")
    .eq("shop_id", input.shopId)
    .in("capability", [TECHNICIAN_COPILOT_TEXT_CAPABILITY, scopedCapability]);

  if (error) {
    console.warn("[technician-copilot] capability lookup failed", {
      shopId: input.shopId,
      error: error.message,
    });
    return false;
  }

  return (data ?? []).some((row) => row.enabled === true);
}
