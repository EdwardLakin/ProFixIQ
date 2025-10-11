"use client";

import { getSupabase } from "@/features/shared/lib/supabase/client";

// Prefer a getter so this file can be imported anywhere in the client safely.
export const supa = () => getSupabase();

export const getCurrentUser = async () => {
  const supabase = supa();
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