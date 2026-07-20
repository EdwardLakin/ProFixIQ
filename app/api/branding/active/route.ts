import { NextResponse } from "next/server";
import { requireBrandShopReadAccess } from "@/features/branding/server/brand";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId");

  const auth = await requireBrandShopReadAccess(shopId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const [
    { data: profile, error: profileErr },
    { data: assets, error: assetsErr },
    { data: userPreferences, error: prefErr },
  ] = await Promise.all([
    auth.supabase
      .from("shop_brand_profiles")
      .select("*")
      .eq("shop_id", auth.shopId)
      .maybeSingle(),
    auth.supabase
      .from("shop_brand_assets")
      .select("*")
      .eq("shop_id", auth.shopId)
      .eq("is_active", true),
    auth.supabase
      .from("user_theme_preferences")
      .select("*")
      .eq("user_id", auth.userId)
      .maybeSingle(),
  ]);

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  if (assetsErr) {
    return NextResponse.json({ error: assetsErr.message }, { status: 500 });
  }

  if (prefErr) {
    return NextResponse.json({ error: prefErr.message }, { status: 500 });
  }

  let logo = (assets ?? []).find((asset) => asset.kind === "logo") ?? null;
  if (profile?.logo_asset_id && logo?.id !== profile.logo_asset_id) {
    const { data: selectedLogo } = await auth.supabase
      .from("shop_brand_assets")
      .select("*")
      .eq("id", profile.logo_asset_id)
      .eq("shop_id", auth.shopId)
      .eq("kind", "logo")
      .maybeSingle();
    logo = selectedLogo ?? logo;
  }

  return NextResponse.json({
    ok: true,
    shopId: auth.shopId,
    profile: profile ?? null,
    assets: assets ?? [],
    logoUrl: logo?.file_url ?? null,
    userPreferences: userPreferences ?? null,
  });
}
