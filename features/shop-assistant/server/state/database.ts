import "server-only";

import { createClient } from "@supabase/supabase-js";

import {
  readSupabaseServerEnv,
  readSupabaseServiceRoleKey,
} from "@/features/shared/lib/supabase/server-env";
import type { ShopAssistantDatabase } from "@shared/types/types/supabase-shop-assistant";

/**
 * State snapshots are server-maintained operational projections. Callers must
 * authenticate and resolve the actor before using this service-role client,
 * then scope every operation by both shop_id and user_id.
 */
export function createShopAssistantStateAdminClient() {
  const { supabaseUrl } = readSupabaseServerEnv();
  return createClient<ShopAssistantDatabase>(
    supabaseUrl,
    readSupabaseServiceRoleKey(),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
