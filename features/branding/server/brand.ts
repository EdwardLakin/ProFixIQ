import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { getRouteHandlerCookies } from "@/features/shared/lib/server/owner-pin";

type DB = Database;

const ADMIN_ROLES = new Set(["owner", "admin", "manager"]);

export type BrandScopedAuth =
  | {
      ok: true;
      supabase: ReturnType<typeof createRouteHandlerClient<DB>>;
      userId: string;
      shopId: string;
      role: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function requireBrandShopAccess(
  requestedShopId?: string | null
): Promise<BrandScopedAuth> {
  const supabase = createRouteHandlerClient<DB>({ cookies: getRouteHandlerCookies() });

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
    .single();

  if (profileErr || !profile?.shop_id) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const shopId = requestedShopId?.trim() ?? profile.shop_id;
  if (!shopId || profile.shop_id !== shopId) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const role = String(profile.role ?? "").toLowerCase();
  if (!ADMIN_ROLES.has(role)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return {
    ok: true,
    supabase,
    userId: user.id,
    shopId,
    role,
  };
}

export function normalizeHexColor(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  return /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(s) ? s : null;
}

export function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_");
}