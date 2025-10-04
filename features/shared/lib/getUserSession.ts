import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";
import { redirect } from "next/navigation";

export async function requireUserSession() {
  const supabase = createServerComponentClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "plan, shop:shop_id (id, name, city, province, owner_id, plan, user_limit)"
    )
    .eq("id", session.user.id)
    .limit(1)          // avoid PostgREST 300
    .maybeSingle();    // resilient single fetch

  if (!profile) redirect("/sign-in");

  return { session, user: session.user, plan: profile.plan, shop: profile.shop };
}

export async function getUserSession() {
  const supabase = createServerComponentClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "plan, shop:shop_id (id, name, city, province, owner_id, plan, user_limit)"
    )
    .eq("id", session.user.id)
    .limit(1)          // avoid PostgREST 300
    .maybeSingle();

  return profile
    ? { session, user: session.user, plan: profile.plan, shop: profile.shop }
    : null;
}