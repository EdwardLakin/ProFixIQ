"use client";

import { useEffect, useState, useCallback } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Profile = DB["public"]["Tables"]["profiles"]["Row"];
type Shop = DB["public"]["Tables"]["shops"]["Row"];
type Role = DB["public"]["Enums"]["user_role_enum"];

// The profile with its joined shop (available as `user.shops`)
type UserWithShop = Profile & { shops: Shop | null };

export function useUser() {
  const supabase = createClientComponentClient<DB>();

  const [user, setUser] = useState<UserWithShop | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);

    // 1) current auth user
    const {
      data: { user: authUser },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr) console.warn("auth.getUser() failed:", authErr);

    if (!authUser) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    // 2) profile + joined shop in one query
    const { data, error } = await supabase
      .from("profiles")
      .select("*, shops(*)")
      .eq("id", authUser.id)
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch profile + shop:", error);
      setUser(null);
    } else {
      setUser((data ?? null) as unknown as UserWithShop);
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

    // realtime: watch this profile row and its shop row (if any)
    let profileChannel: ReturnType<typeof supabase.channel> | null = null;
    let shopChannel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) return;

      // profile changes
      profileChannel = supabase
        .channel(`profile-${authUser.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "profiles", filter: `id=eq.${authUser.id}` },
          () => void load(),
        )
        .subscribe();

      // find current shop id (lightweight)
      const { data: p } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", authUser.id)
        .maybeSingle();

      const shopId = p?.shop_id;
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

  // handy typed role
  const role: Role | null = (user?.role as Role | null) ?? null;

  return { user, role, isLoading, refresh: load };
}