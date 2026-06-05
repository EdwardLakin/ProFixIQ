import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { switchActiveShop } from "@/features/shops/server/shop-switcher";

type ProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "role" | "shop_id" | "business_name" | "shop_name"
>;

export async function POST(request: Request) {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { shop_id?: unknown } | null;
  const requestedShopId = typeof body?.shop_id === "string" ? body.shop_id : "";

  if (!requestedShopId.trim()) {
    return NextResponse.json({ error: "shop_id is required" }, { status: 400 });
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

  const result = await switchActiveShop({
    admin,
    actorProfile: profile,
    requestedShopId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    currentShop: result.currentShop,
    shops: result.shops,
  });
}
