import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

const WRITE_ROLES = new Set(["owner", "admin", "manager"]);

export type BrandReadAuth =
  | {
      ok: true;
      supabase: ReturnType<typeof createServerSupabaseRoute>;
      userId: string;
      shopId: string;
      role: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export type BrandWriteAuth = BrandReadAuth;

export async function requireBrandShopReadAccess(
  requestedShopId?: string | null
): Promise<BrandReadAuth> {
  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr || !profile?.shop_id) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const shopId = requestedShopId?.trim() || profile.shop_id;
  if (shopId !== profile.shop_id) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return {
    ok: true,
    supabase,
    userId: user.id,
    shopId,
    role: String(profile.role ?? "").toLowerCase(),
  };
}

export async function requireBrandShopWriteAccess(
  requestedShopId?: string | null
): Promise<BrandWriteAuth> {
  const auth = await requireBrandShopReadAccess(requestedShopId);
  if (!auth.ok) return auth;
  if (!WRITE_ROLES.has(auth.role)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return auth;
}

export function normalizeHexColor(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  return /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(s) ? s.toUpperCase() : null;
}

export function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_");
}

export function hexToRgbTuple(hex: string | null): [number, number, number] | null {
  if (!hex) return null;
  const s = hex.replace("#", "");
  if (s.length !== 6 && s.length !== 8) return null;
  const base = s.slice(0, 6);
  const r = Number.parseInt(base.slice(0, 2), 16);
  const g = Number.parseInt(base.slice(2, 4), 16);
  const b = Number.parseInt(base.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return [r, g, b];
}
