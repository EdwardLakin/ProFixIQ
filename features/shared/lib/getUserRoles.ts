// app/(wherever)/getUserRoles.ts
"use server";

import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";

export async function getUserRoles(): Promise<string[]> {
  const supabase = createServerSupabaseRSC();

  // Check auth session
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Query the profile row for role(s)
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("❌ Failed to load roles:", error);
    return [];
  }

  // If your schema uses a single role field
  if (profile?.role && typeof profile.role === "string") {
    return [profile.role];
  }

  // If you later extend to array/jsonb roles, normalize here
  if (Array.isArray(profile?.role)) {
    return profile.role;
  }

  return [];
}