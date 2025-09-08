"use client";

import type { Database } from "@shared/types/types/supabase";
import { useUser } from "@/features/auth/hooks/useUser";

export type Role = Database["public"]["Enums"]["user_role_enum"] | null;

export function useUserRole(): { role: Role; loading: boolean } {
  const { role, isLoading } = useUser();
  return { role, loading: isLoading };
}
