import { NextResponse } from "next/server";
import { requireBrandShopWriteAccess } from "@/features/branding/server/brand";
import { requireOwnerPinVerified } from "@/features/shared/lib/server/owner-pin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const assetId = String(id ?? "").trim();

  if (!assetId) {
    return NextResponse.json({ error: "Missing asset id" }, { status: 400 });
  }

  const auth = await requireBrandShopWriteAccess(null);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const pinCheck = await requireOwnerPinVerified(
    req,
    auth.supabase as never,
    auth.shopId,
  );

  if (!pinCheck.ok) {
    return pinCheck.response;
  }

  const { data: asset, error: assetError } = await auth.supabase
    .from("shop_brand_assets")
    .select("id, shop_id, kind, archived_at")
    .eq("id", assetId)
    .eq("shop_id", auth.shopId)
    .maybeSingle();

  if (assetError) {
    return NextResponse.json({ error: assetError.message }, { status: 500 });
  }

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  if (asset.archived_at) {
    return NextResponse.json(
      { error: "Archived assets cannot be activated" },
      { status: 400 },
    );
  }

  const { error: deactivateError } = await auth.supabase
    .from("shop_brand_assets")
    .update({ is_active: false })
    .eq("shop_id", auth.shopId)
    .eq("kind", asset.kind)
    .eq("is_active", true)
    .neq("id", asset.id);

  if (deactivateError) {
    return NextResponse.json(
      { error: deactivateError.message },
      { status: 500 },
    );
  }

  const { data: updated, error: activateError } = await auth.supabase
    .from("shop_brand_assets")
    .update({ is_active: true })
    .eq("id", asset.id)
    .eq("shop_id", auth.shopId)
    .select("*")
    .single();

  if (activateError) {
    return NextResponse.json({ error: activateError.message }, { status: 500 });
  }

  const profilePatch: {
    shop_id: string;
    updated_by: string;
    logo_asset_id?: string;
    icon_asset_id?: string;
    wordmark_asset_id?: string;
    watermark_asset_id?: string;
  } = {
    shop_id: auth.shopId,
    updated_by: auth.userId,
  };

  if (asset.kind === "logo") profilePatch.logo_asset_id = asset.id;
  if (asset.kind === "icon") profilePatch.icon_asset_id = asset.id;
  if (asset.kind === "wordmark") profilePatch.wordmark_asset_id = asset.id;
  if (asset.kind === "watermark") {
    profilePatch.watermark_asset_id = asset.id;
  }

  const { error: profileError } = await auth.supabase
    .from("shop_brand_profiles")
    .upsert(profilePatch, { onConflict: "shop_id" });

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    asset: updated,
  });
}