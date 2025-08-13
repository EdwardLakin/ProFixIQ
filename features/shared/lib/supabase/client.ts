// features/shared/lib/supabase/client.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@shared/types/types/supabase";

/**
 * Client-side Supabase instance.
 * Uses the public anon key and URL.
 * Safe to import anywhere in the client code.
 */
export const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);