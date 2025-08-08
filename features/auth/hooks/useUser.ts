// src/hooks/useUser.ts
"use client";

import { useEffect, useState } from "react";
import supabase from "@shared/lib/supabaseClient";
import type { Database } from "@shared/types/supabase";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Shop = Database["public"]["Tables"]["shop"]["Row"];

type UserWithShop = Profile & {
  shop?: Shop | null;
};

export function useUser() {
  const [user, setUser] = useState<UserWithShop | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      setIsLoading(true);

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*, shop(*)")
        .eq("id", authUser.id)
        .single();

      if (error) {
        console.error("Failed to fetch user profile:", error);
        setUser(null);
      } else {
        setUser(data as UserWithShop);
      }

      setIsLoading(false);
    };

    fetchUser();
  }, []);

  return { user, isLoading };
}
