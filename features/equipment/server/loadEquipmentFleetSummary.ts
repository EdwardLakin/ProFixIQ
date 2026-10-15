import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import {
  accumulateFleetSummary,
  emptyFleetSummary,
  type EquipmentFleetSummary,
} from "@/features/equipment/lib/equipmentDashboard";
import {
  EQUIPMENT_DIRECTORY_LIMIT,
  loadEquipmentDirectory,
} from "@/features/equipment/server/loadEquipmentDirectory";
import type { CanonicalRole } from "@/features/shared/lib/rbac";

/** Most assets one dashboard load will scan; beyond this the summary reports `partial`. */
export const FLEET_SUMMARY_MAX_ASSETS = 2_000;

/**
 * Shop-wide Equipment summary. Walks every profile of the shop in directory-
 * sized windows, running each through the directory loader (so each row's PM,
 * inspection and work-order state is the exact value `/equipment` shows) and
 * folds the rows into counts. Only the running counts and a short attention
 * list are kept between windows.
 */
export async function loadEquipmentFleetSummary(input: {
  supabase: SupabaseClient<Database>;
  admin: SupabaseClient<Database>;
  shopId: string;
  role: CanonicalRole;
  now?: Date;
  maxAssets?: number;
}): Promise<EquipmentFleetSummary> {
  const max = input.maxAssets ?? FLEET_SUMMARY_MAX_ASSETS;
  const summary = emptyFleetSummary();
  for (let offset = 0; offset < max; offset += EQUIPMENT_DIRECTORY_LIMIT) {
    const limit = Math.min(EQUIPMENT_DIRECTORY_LIMIT, max - offset);
    const page = await loadEquipmentDirectory({
      supabase: input.supabase,
      admin: input.admin,
      shopId: input.shopId,
      role: input.role,
      now: input.now,
      window: { offset, limit },
    });
    accumulateFleetSummary(summary, page.rows, input.now);
    if (!page.truncated) return summary;
  }
  // The last window still had more profiles behind it.
  summary.partial = true;
  return summary;
}
