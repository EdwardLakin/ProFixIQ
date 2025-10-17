"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Profile = DB["public"]["Tables"]["profiles"]["Row"];
type Shop    = DB["public"]["Tables"]["shops"]["Row"];
type Role    = DB["public"]["Enums"]["user_role_enum"];

// Keep the old UI contract: shop lives at `user.shops`
export type UserWithShop = Profile & { shops: Shop | null };

export function useUser() {
  const supabase = createClientComponentClient<DB>();

  const [user, setUser] = useState<UserWithShop | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // avoid repeating the same RPC over and over when nothing changed
  const lastShopIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);

    // 1) Get current auth user
    const {
      data: { user: authUser },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr) console.warn("auth.getUser() failed:", authErr);

    if (!authUser) {
      setUser(null);
      setIsLoading(false);
      lastShopIdRef.current = null; // clear local memory
      return;
    }

    // 2) Fetch profile ONLY (no embedded select)
    const { data: pData, error: pErr } = await supabase
      .from("profiles")
      .select(
        [
          "id",
          "role",
          "shop_id",
          "plan",
          "business_name",
          "city",
          "province",
          "postal_code",
          "phone",
          "email",
          "full_name",
          "street",
          "shop_name",
          "created_at",
          "updated_at",
          "user_id",
          "completed_onboarding",
        ].join(","),
      )
      .eq("id", authUser.id)
      .maybeSingle();

    if (pErr) {
      console.error("Failed to fetch profile:", pErr);
      setUser(null);
      setIsLoading(false);
      return;
    }

    const profile = (pData ?? null) as Profile | null;
    if (!profile) {
      setUser(null);
      setIsLoading(false);
      lastShopIdRef.current = null;
      return;
    }

    // 2.5) IMPORTANT: set session-scoped shop id for RLS
    // Only call when it changed and only if we have a shop_id.
    if (profile.shop_id && lastShopIdRef.current !== profile.shop_id) {
      try {
        // NOTE: RPC param name is p_shop_id (matches SQL function signature)
        await supabase.rpc("set_current_shop_id", { p_shop_id: profile.shop_id });
        lastShopIdRef.current = profile.shop_id;
      } catch (e) {
        // non-fatal; UI still works for tables that don't use current_shop_id()
        console.warn("set_current_shop_id RPC failed:", e);
        lastShopIdRef.current = null;
      }
    }

    // 3) Optional shop lookup (separate query)
    let shop: Shop | null = null;
    if (profile.shop_id) {
      const { data: sData, error: sErr } = await supabase
        .from("shops")
        .select(
          [
            "id",
            "name",
            "city",
            "province",
            "address",
            "street",
            "postal_code",
            "email",
            "phone_number",
            "owner_id",
            "plan",
            "user_limit",
            "labor_rate",
            "tax_rate",
            "supplies_percent",
            "timezone",
            "created_at",
            "updated_at",
          ].join(","),
        )
        .eq("id", profile.shop_id)
        .maybeSingle();

      if (sErr) {
        console.warn("Shop lookup failed:", sErr);
      } else {
        shop = (sData ?? null) as Shop | null;
      }
    }

    // Keep the 'shops' property name for back-compat with existing UI
    const merged: UserWithShop = { ...(profile as Profile), shops: shop };
    setUser(merged);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    // Initial load
    void load();

    // Re-load on auth state changes (sign in/out, token refresh, etc.)
    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      void load();
    });

    // Realtime: watch this profile row and the current shop row (if any)
    let profileChannel: ReturnType<typeof supabase.channel> | null = null;
    let shopChannel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const authUser = auth.user;
      if (!authUser) return;

      // Profile changes
      profileChannel = supabase
        .channel(`profile-${authUser.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "profiles", filter: `id=eq.${authUser.id}` },
          () => void load(),
        )
        .subscribe();

      // Determine current shop id (light call)
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

  // Handy typed role export
  const role: Role | null = (user?.role as Role | null) ?? null;

  return { user, role, isLoading, refresh: load };
}