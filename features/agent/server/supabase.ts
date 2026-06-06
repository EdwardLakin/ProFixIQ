import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

export function getServerSupabase() {
  return createServerSupabaseRoute();
}

export async function getUserAndShopId() {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("user_id", user.id)
    .single();
  if (error || !profile?.shop_id) throw new Error("No active shop");
  return { supabase, user, shopId: profile.shop_id as string };
}
