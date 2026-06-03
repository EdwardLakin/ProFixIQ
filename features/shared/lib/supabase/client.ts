// src/features/shared/lib/supabase/client.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@shared/types/types/supabase";

let _client: ReturnType<typeof createBrowserClient<Database>> | null = null;

function mustBrowserEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export function createBrowserSupabase() {
  if (_client) return _client;
  _client = createBrowserClient<Database>(
    mustBrowserEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustBrowserEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
  return _client;
}

export const supabaseBrowser = createBrowserSupabase();
