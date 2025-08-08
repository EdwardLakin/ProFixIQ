"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@shared/types/types/supabase";

export const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Optional wrapper to get user session in client component
export const getCurrentUser = async () => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error("Session error:", error);
    return null;
  }

  return session?.user ?? null;
};