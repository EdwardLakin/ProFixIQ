"use client";

import { supabaseBrowser } from "@/features/shared/lib/supabase/client";

export const supa = () => supabaseBrowser;

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