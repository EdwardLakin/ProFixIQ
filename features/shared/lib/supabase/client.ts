"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

let _client: ReturnType<typeof createClientComponentClient<Database>> | null = null;

export function createBrowserSupabase() {
  if (_client) return _client;
  _client = createClientComponentClient<Database>();
  return _client;
}

// Optional ready-to-use singleton
export const supabaseBrowser = createBrowserSupabase();