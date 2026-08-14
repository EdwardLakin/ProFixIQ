import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/features/shared/types/types/supabase";

export type TechnicianCopilotCapabilities = {
  text: boolean;
  documentation: boolean;
  voice: boolean;
};

type CapabilityRow = {
  capability: string;
  enabled: boolean;
};

function configuredValue(
  rows: readonly CapabilityRow[],
  capability: string,
  technicianId: string,
): boolean | undefined {
  const technician = rows.find(
    (row) => row.capability === `${capability}:${technicianId}`,
  );
  if (technician) return technician.enabled;

  const shop = rows.find((row) => row.capability === capability);
  return shop?.enabled;
}

export function resolveTechnicianCopilotCapabilities(
  rows: readonly CapabilityRow[],
  technicianId: string,
): TechnicianCopilotCapabilities {
  const text =
    configuredValue(rows, "technician_copilot_text", technicianId) ?? false;
  const documentation =
    configuredValue(
      rows,
      "technician_copilot_documentation",
      technicianId,
    ) ?? text;
  const voice =
    configuredValue(rows, "technician_copilot_voice", technicianId) ?? false;

  return { text, documentation, voice };
}

export async function getTechnicianCopilotCapabilities(
  supabase: SupabaseClient<Database>,
  shopId: string,
  technicianId: string,
): Promise<TechnicianCopilotCapabilities> {
  const names = [
    "technician_copilot_text",
    `technician_copilot_text:${technicianId}`,
    "technician_copilot_documentation",
    `technician_copilot_documentation:${technicianId}`,
    "technician_copilot_voice",
    `technician_copilot_voice:${technicianId}`,
  ];
  const result = await supabase
    .from("ai_automation_capability_settings")
    .select("capability,enabled")
    .eq("shop_id", shopId)
    .in("capability", names);

  if (result.error) return { text: false, documentation: false, voice: false };
  return resolveTechnicianCopilotCapabilities(
    (result.data ?? []) as CapabilityRow[],
    technicianId,
  );
}

export async function hasTechnicianCopilotTextCapability(
  supabase: SupabaseClient<Database>,
  shopId: string,
  technicianId: string,
): Promise<boolean> {
  const capabilities = await getTechnicianCopilotCapabilities(
    supabase,
    shopId,
    technicianId,
  );
  return capabilities.text;
}
