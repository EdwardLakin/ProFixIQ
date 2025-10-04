import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";
import { redirect } from "next/navigation";

type DB = Database;

/**
 * Fetch the user's session and related profile/shop info without using
 * PostgREST embedded selects (which can return 300 Multiple Choices).
 *
 * Pattern:
 *  1) profiles: select plan, shop_id
 *  2) shops:    select fields by shop_id (only if present)
 */

export async function requireUserSession() {
  const supabase = createServerComponentClient<DB>({ cookies });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/sign-in");

  // 1) Profile (no embed)
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("plan, shop_id")
    .eq("id", session.user.id)
    .limit(1)
    .maybeSingle();

  if (profErr || !profile) redirect("/sign-in");

  // 2) Shop (optional; only if profile.shop_id exists)
  let shop:
    | {
        id: string;
        name: string | null;
        city: string | null;
        province: string | null;
        owner_id: string | null;
        plan: string | null;
        user_limit: number | null;
      }
    | null = null;

  if (profile.shop_id) {
    const { data: s, error: shopErr } = await supabase
      .from("shops")
      .select("id, name, city, province, owner_id, plan, user_limit")
      .eq("id", profile.shop_id)
      .limit(1)
      .maybeSingle();

    if (shopErr) {
      // Non-fatal; treat as no shop and continue
      shop = null;
    } else {
      shop = s ?? null;
    }
  }

  return { session, user: session.user, plan: profile.plan, shop };
}

export async function getUserSession() {
  const supabase = createServerComponentClient<DB>({ cookies });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return null;

  // 1) Profile (no embed)
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, shop_id")
    .eq("id", session.user.id)
    .limit(1)
    .maybeSingle();

  if (!profile) return null;

  // 2) Shop (optional)
  let shop:
    | {
        id: string;
        name: string | null;
        city: string | null;
        province: string | null;
        owner_id: string | null;
        plan: string | null;
        user_limit: number | null;
      }
    | null = null;

  if (profile.shop_id) {
    const { data: s } = await supabase
      .from("shops")
      .select("id, name, city, province, owner_id, plan, user_limit")
      .eq("id", profile.shop_id)
      .limit(1)
      .maybeSingle();
    shop = s ?? null;
  }

  return { session, user: session.user, plan: profile.plan, shop };
}