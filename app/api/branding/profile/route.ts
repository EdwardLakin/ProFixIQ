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

  surfaceColor?: string | null;
  surfaceColor2?: string | null;
  sidebarColor?: string | null;
  topbarColor?: string | null;
  pageBackground?: string | null;
  cardBackground?: string | null;
  cardBorderColor?: string | null;
  textPrimary?: string | null;
  textSecondary?: string | null;
  buttonPrimaryBg?: string | null;
  buttonPrimaryText?: string | null;
  buttonSecondaryBg?: string | null;
  buttonSecondaryText?: string | null;
  inputBackground?: string | null;
  inputBorder?: string | null;
  inputText?: string | null;
  radiusScale?: string | null;
  shadowStyle?: string | null;
  themeMode?: string | null;

  metadata?: Json;
};

function normalizeEnum(
  value: unknown,
  allowed: readonly string[],
): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  return allowed.includes(raw) ? raw : null;
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

    surface_color: normalizeHexColor(body.surfaceColor),
    surface_color_2: normalizeHexColor(body.surfaceColor2),
    sidebar_color: normalizeHexColor(body.sidebarColor),
    topbar_color: normalizeHexColor(body.topbarColor),
    page_background: normalizeHexColor(body.pageBackground),
    card_background: normalizeHexColor(body.cardBackground),
    card_border_color: normalizeHexColor(body.cardBorderColor),
    text_primary: normalizeHexColor(body.textPrimary),
    text_secondary: normalizeHexColor(body.textSecondary),
    button_primary_bg: normalizeHexColor(body.buttonPrimaryBg),
    button_primary_text: normalizeHexColor(body.buttonPrimaryText),
    button_secondary_bg: normalizeHexColor(body.buttonSecondaryBg),
    button_secondary_text: normalizeHexColor(body.buttonSecondaryText),
    input_background: normalizeHexColor(body.inputBackground),
    input_border: normalizeHexColor(body.inputBorder),
    input_text: normalizeHexColor(body.inputText),
    radius_scale: normalizeEnum(body.radiusScale, ["none", "sm", "md", "lg", "xl"]),
    shadow_style: normalizeEnum(body.shadowStyle, ["none", "soft", "medium", "strong"]),
    theme_mode: normalizeEnum(body.themeMode, ["dark", "light", "custom"]),

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
