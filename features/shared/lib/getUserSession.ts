// /app/(wherever)/getUserSession.ts
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";
import { redirect } from "next/navigation";

export async function requireUserSession() {
  const supabase = createServerComponentClient<Database>({ cookies });
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) redirect("/sign-in");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("plan, shop:shop_id (id, name, city, province, owner_id, plan, user_limit)")
    .eq("id", session.user.id)
    .single();

  if (error || !profile) redirect("/sign-in");

  return { session, user: session.user, plan: profile.plan, shop: profile.shop };
}

export async function getUserSession() {
  const supabase = createServerComponentClient<Database>({ cookies });
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, shop:shop_id (id, name, city, province, owner_id, plan, user_limit)")
    .eq("id", session.user.id)
    .maybeSingle();

  return profile
    ? { session, user: session.user, plan: profile.plan, shop: profile.shop }
    : null;
}