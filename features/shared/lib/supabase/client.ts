"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

// Small memoized getter — avoid exporting a global singleton from ssr package.
let _client: ReturnType<typeof createClientComponentClient<Database>> | null = null;

export function getSupabase() {
  if (_client) return _client;
  _client = createClientComponentClient<Database>();
  return _client;
}