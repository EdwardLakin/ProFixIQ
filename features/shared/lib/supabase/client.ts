// src/features/shared/lib/supabase/client.ts
"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

let _client: ReturnType<typeof createClientComponentClient<Database>> | null =
  null;

export function createBrowserSupabase() {
  if (_client) return _client;
  _client = createClientComponentClient<Database>();
  return _client;
}

export const supabaseBrowser = createBrowserSupabase();