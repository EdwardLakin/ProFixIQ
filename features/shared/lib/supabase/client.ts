// features/shared/lib/supabase/client.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@shared/types/types/supabase";

let _client:
  | ReturnType<typeof createBrowserClient<Database>>
  | null = null;

export function createBrowserSupabase() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  _client = createBrowserClient<Database>(url, anon);
  return _client;
}

// optional ready-to-use singleton
export const supabaseBrowser = createBrowserSupabase();