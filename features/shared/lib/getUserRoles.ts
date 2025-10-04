// app/(wherever)/getUserRoles.ts
"use server";

import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";

export async function getUserRoles(): Promise<string[]> {
  const supabase = createServerComponentClient<Database>({ cookies });

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