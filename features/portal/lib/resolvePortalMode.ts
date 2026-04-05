import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

export type PortalMode = "customer";

export async function resolvePortalMode(
  _supabase: SupabaseClient<Database>,
  _userId: string,
): Promise<PortalMode> {
  return "customer";
}
