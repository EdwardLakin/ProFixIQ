"use client";

import { useEffect, useState, useCallback } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Profile = DB["public"]["Tables"]["profiles"]["Row"];
type Shop = DB["public"]["Tables"]["shops"]["Row"];
type Role = DB["public"]["Enums"]["user_role_enum"];

type UserWithShop = Profile & {
  // Joined via select("*, shops(*)")
  shops?: Shop | null;
};

export function useUser() {
  const supabase = createClientComponentClient<DB>();

  const [user, setUser] = useState<UserWithShop | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);

    // 1) session
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    // 2) profile (+ shop)
    const { data, error } = await supabase
      .from("profiles")
      .select("*, shops(*)")
      .eq("id", authUser.id)
      .single();

    if (error) {
      console.error("Failed to fetch user profile:", error);
      setUser(null);
    } else {
      // Strongly typed cast to our extended shape
      setUser(data as unknown as UserWithShop);
    }

    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    // initial load
    void load();

    // react to auth changes
    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      void load();
    });

    // realtime: watch this profile row and linked shop row (if any)
    let profileChannel: ReturnType<typeof supabase.channel> | null = null;
    let shopChannel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) return;

      profileChannel = supabase
        .channel(`profile-${authUser.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "profiles", filter: `id=eq.${authUser.id}` },
          () => void load(),
        )
        .subscribe();

      const { data: profile } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", authUser.id)
        .single();

      const shopId = profile?.shop_id;
      if (shopId) {
        shopChannel = supabase
          .channel(`shop-${shopId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "shops", filter: `id=eq.${shopId}` },
            () => void load(),
          )
          .subscribe();
      }
    })();

    return () => {
      authSub.subscription.unsubscribe();
      if (profileChannel) supabase.removeChannel(profileChannel);
      if (shopChannel) supabase.removeChannel(shopChannel);
    };
  }, [supabase, load]);

  // Surface a handy, typed role alongside the user object
  const role: Role | null = (user?.role as Role | null) ?? null;

  return { user, role, isLoading, refresh: load };
}