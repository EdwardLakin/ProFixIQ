import { NextResponse } from "next/server";
import { requireBrandShopReadAccess } from "@/features/branding/server/brand";

type Payload = {
  themeMode?: string | null;
  radiusScale?: string | null;
  shadowStyle?: string | null;
};

function normalizeThemeMode(
  value: unknown,
): "light" | "dark" | "system" | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "light" || v === "dark" || v === "system") return v;
  return null;
}

function normalizeRadiusScale(
  value: unknown,
): "none" | "sm" | "md" | "lg" | "xl" | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "none" || v === "sm" || v === "md" || v === "lg" || v === "xl") {
    return v;
  }
  return null;
}

function normalizeShadowStyle(
  value: unknown,
): "none" | "soft" | "medium" | "strong" | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "none" || v === "soft" || v === "medium" || v === "strong") {
    return v;
  }
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
    .from("user_theme_preferences")
    .select("*")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    preferences: data ?? null,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Payload;

  const auth = await requireBrandShopReadAccess(null);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const patch: Record<string, string | null> = {
    user_id: auth.userId,
    shop_id: auth.shopId,
  };

  if ("themeMode" in body) {
    patch.theme_mode = normalizeThemeMode(body.themeMode);
  }
  if ("radiusScale" in body) {
    patch.radius_scale = normalizeRadiusScale(body.radiusScale);
  }
  if ("shadowStyle" in body) {
    patch.shadow_style = normalizeShadowStyle(body.shadowStyle);
  }

  const { data, error } = await auth.supabase
    .from("user_theme_preferences")
    .upsert(patch, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, preferences: data });
}
