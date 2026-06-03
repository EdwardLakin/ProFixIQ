// src/features/shared/lib/supabase/admin.ts
import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  readSupabaseServerEnv,
  readSupabaseServiceRoleKey,
} from "./server-env";

let adminClient: SupabaseClient<Database> | null = null;

function createSupabaseAdminClient(): SupabaseClient<Database> {
  const { supabaseUrl } = readSupabaseServerEnv();
  return createClient<Database>(supabaseUrl, readSupabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Service-role client (server-only).
 * NEVER import from client components.
 */
export const supabaseAdmin = new Proxy({} as SupabaseClient<Database>, {
  get(_target, property, receiver) {
    adminClient ??= createSupabaseAdminClient();
    return Reflect.get(adminClient, property, receiver);
  },
  set(_target, property, value, receiver) {
    adminClient ??= createSupabaseAdminClient();
    return Reflect.set(adminClient, property, value, receiver);
  },
});
