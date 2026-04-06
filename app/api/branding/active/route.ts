import { NextResponse } from "next/server";
import { requireBrandShopAccess } from "@/features/branding/server/brand";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId");

  const auth = await requireBrandShopAccess(shopId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: profile, error: profileErr } = await auth.supabase
    .from("shop_brand_profiles")
    .select("*")
    .eq("shop_id", auth.shopId)
    .maybeSingle();

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  const { data: assets, error: assetsErr } = await auth.supabase
    .from("shop_brand_assets")
    .select("*")
    .eq("shop_id", auth.shopId)
    .eq("is_active", true);

  if (assetsErr) {
    return NextResponse.json({ error: assetsErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    profile: profile ?? null,
    assets: assets ?? [],
  });
}
