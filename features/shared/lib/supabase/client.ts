// src/features/shared/lib/supabase/client.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { readSupabasePublicEnv } from "./public-env";

type BrowserSupabaseClient = SupabaseClient<Database>;

let _client: BrowserSupabaseClient | null = null;

export function createBrowserSupabase(): BrowserSupabaseClient {
  if (_client) return _client;

  const { supabaseUrl, supabaseAnonKey } = readSupabasePublicEnv("browser");
  _client = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
  return _client;
}

export const supabaseBrowser = new Proxy({} as BrowserSupabaseClient, {
  get(_target, property, receiver) {
    return Reflect.get(createBrowserSupabase(), property, receiver);
  },
  set(_target, property, value, receiver) {
    return Reflect.set(createBrowserSupabase(), property, value, receiver);
  },
});
