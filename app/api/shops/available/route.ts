import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getAvailableShopContext } from "@/features/shops/server/shop-switcher";

type ProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "role" | "shop_id" | "business_name" | "shop_name"
>;

export async function GET() {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminSupabase();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role, shop_id, business_name, shop_name")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile for current user not found" }, { status: 403 });
  }

  const context = await getAvailableShopContext({ admin, profile });

  return NextResponse.json({
    currentShop: context.currentShop,
    shops: context.shops,
    canSwitch: context.canSwitch,
  });
}
