// features/auth/hooks/useUser.ts
"use client";

import { useEffect, useState, useCallback } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Shop = Database["public"]["Tables"]["shops"]["Row"];

type UserWithShop = Profile & {
  shops?: Shop | null; // joined as "shops(*)"
};

export function useUser() {
  const supabase = createClientComponentClient<Database>();

  const [user, setUser] = useState<UserWithShop | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);

    // session user
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    // profile + shop join (plural: shops)
    const { data, error } = await supabase
      .from("profiles")
      .select("*, shops(*)")
      .eq("id", authUser.id)
      .single();

    if (error) {
      console.error("Failed to fetch user profile:", error);
      setUser(null);
    } else {
      setUser(data as unknown as UserWithShop);
    }

    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    // initial load
    load();

    // reload on sign-in/out, token refresh, etc.
    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    // realtime: profile row for this user (+ watch linked shop row)
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
          {
            event: "*",
            schema: "public",
            table: "profiles",
            filter: `id=eq.${authUser.id}`,
          },
          () => load(),
        )
        .subscribe();

      // if the profile links to a shop, also watch that shop row (plural: shops)
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
            {
              event: "*",
              schema: "public",
              table: "shops",
              filter: `id=eq.${shopId}`,
            },
            () => load(),
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

  return { user, isLoading, refresh: load };
}