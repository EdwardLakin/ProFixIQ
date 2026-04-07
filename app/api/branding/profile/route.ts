import { NextResponse } from "next/server";
import type { Database, Json } from "@shared/types/types/supabase";
import {
  requireBrandShopReadAccess,
  requireBrandShopWriteAccess,
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

  app_background?: string | null;
  app_background_secondary?: string | null;
  sidebar_background?: string | null;
  sidebar_text?: string | null;
  sidebar_active_background?: string | null;
  sidebar_active_text?: string | null;
  header_background?: string | null;
  header_text?: string | null;
  card_background?: string | null;
  card_border?: string | null;
  surface_2_background?: string | null;
  text_primary?: string | null;
  text_secondary?: string | null;
  text_muted?: string | null;
  button_primary_bg?: string | null;
  button_primary_text?: string | null;
  button_secondary_bg?: string | null;
  button_secondary_text?: string | null;
  input_background?: string | null;
  input_border?: string | null;
  input_text?: string | null;
  radius_scale?: string | null;
  shadow_style?: string | null;
  theme_mode?: string | null;
};

function normalizeThemeMode(value: unknown): "light" | "dark" | "system" | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "light" || v === "dark" || v === "system") return v;
  return null;
}

function normalizeRadiusScale(value: unknown): "none" | "sm" | "md" | "lg" | "xl" | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "none" || v === "sm" || v === "md" || v === "lg" || v === "xl") return v;
  return null;
}

function normalizeShadowStyle(value: unknown): "none" | "soft" | "medium" | "strong" | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "none" || v === "soft" || v === "medium" || v === "strong") return v;
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId");

  const auth = await requireBrandShopReadAccess(shopId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await auth.supabase
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
    shopId: auth.shopId,
    profile: data ?? null,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as ProfilePayload;
  const auth = await requireBrandShopWriteAccess(body.shopId);

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

    app_background: normalizeHexColor(body.app_background),
    app_background_secondary: normalizeHexColor(body.app_background_secondary),
    sidebar_background: normalizeHexColor(body.sidebar_background),
    sidebar_text: normalizeHexColor(body.sidebar_text),
    sidebar_active_background: normalizeHexColor(body.sidebar_active_background),
    sidebar_active_text: normalizeHexColor(body.sidebar_active_text),
    header_background: normalizeHexColor(body.header_background),
    header_text: normalizeHexColor(body.header_text),
    card_background: normalizeHexColor(body.card_background),
    card_border: normalizeHexColor(body.card_border),
    surface_2_background: normalizeHexColor(body.surface_2_background),
    text_primary: normalizeHexColor(body.text_primary),
    text_secondary: normalizeHexColor(body.text_secondary),
    text_muted: normalizeHexColor(body.text_muted),
    button_primary_bg: normalizeHexColor(body.button_primary_bg),
    button_primary_text: normalizeHexColor(body.button_primary_text),
    button_secondary_bg: normalizeHexColor(body.button_secondary_bg),
    button_secondary_text: normalizeHexColor(body.button_secondary_text),
    input_background: normalizeHexColor(body.input_background),
    input_border: normalizeHexColor(body.input_border),
    input_text: normalizeHexColor(body.input_text),
    radius_scale: normalizeRadiusScale(body.radius_scale),
    shadow_style: normalizeShadowStyle(body.shadow_style),
    theme_mode: normalizeThemeMode(body.theme_mode),
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
