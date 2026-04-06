import { NextResponse } from "next/server";
import type { Database, Json } from "@shared/types/types/supabase";
import {
  requireBrandShopAccess,
  normalizeHexColor,
} from "@/features/branding/server/brand";
import { requireOwnerPinVerified } from "@/features/shared/lib/server/owner-pin";

type DB = Database;

type ProfilePayload = {
  shopId?: string;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  stylePreset?: string | null;
  logoAssetId?: string | null;
  iconAssetId?: string | null;
  wordmarkAssetId?: string | null;
  watermarkAssetId?: string | null;
  metadata?: Json;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId");

  const auth = await requireBrandShopAccess(shopId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase } = auth;

  const { data, error } = await supabase
    .from("shop_brand_profiles")
    .select(`
      *,
      logo_asset:logo_asset_id(id, kind, file_url, storage_bucket, storage_path, is_active),
      icon_asset:icon_asset_id(id, kind, file_url, storage_bucket, storage_path, is_active),
      wordmark_asset:wordmark_asset_id(id, kind, file_url, storage_bucket, storage_path, is_active),
      watermark_asset:watermark_asset_id(id, kind, file_url, storage_bucket, storage_path, is_active)
    `)
    .eq("shop_id", auth.shopId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    profile: data ?? null,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as ProfilePayload;
  const auth = await requireBrandShopAccess(body.shopId);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const pinCheck = await requireOwnerPinVerified(req, auth.supabase as never, auth.shopId);
  if (!pinCheck.ok) {
    return pinCheck.response;
  }

  const patch: DB["public"]["Tables"]["shop_brand_profiles"]["Insert"] = {
    shop_id: auth.shopId,
    primary_color: normalizeHexColor(body.primaryColor),
    secondary_color: normalizeHexColor(body.secondaryColor),
    accent_color: normalizeHexColor(body.accentColor),
    style_preset: body.stylePreset?.trim() || null,
    logo_asset_id: body.logoAssetId?.trim() || null,
    icon_asset_id: body.iconAssetId?.trim() || null,
    wordmark_asset_id: body.wordmarkAssetId?.trim() || null,
    watermark_asset_id: body.watermarkAssetId?.trim() || null,
    updated_by: auth.userId,
    metadata: body.metadata ?? {},
  };

  const { data, error } = await auth.supabase
    .from("shop_brand_profiles")
    .upsert(patch, { onConflict: "shop_id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, profile: data });
}