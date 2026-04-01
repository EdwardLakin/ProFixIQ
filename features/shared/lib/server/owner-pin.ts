import { cookies as nextCookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export const OWNER_PIN_COOKIE_NAME = "pfq_owner_pin_shop";
export const OWNER_PIN_TTL_SECONDS = 60 * 30;

type SupabaseLike = {
  from: (table: keyof DB["public"]["Tables"] | string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        single: () => Promise<{ data: any; error: any }>;
      };
    };
  };
};

export function getOwnerPinCookieFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie") ?? "";
  if (!cookieHeader) return null;

  const parts = cookieHeader.split(";").map((p) => p.trim());
  const match = parts.find((p) => p.startsWith(`${OWNER_PIN_COOKIE_NAME}=`));
  if (!match) return null;

  const value = match.slice(`${OWNER_PIN_COOKIE_NAME}=`.length);
  return decodeURIComponent(value || "");
}

export function setOwnerPinVerifiedCookie(res: NextResponse, shopId: string) {
  res.cookies.set(OWNER_PIN_COOKIE_NAME, shopId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OWNER_PIN_TTL_SECONDS,
  });

  return res;
}

export function clearOwnerPinVerifiedCookie(res: NextResponse) {
  res.cookies.set(OWNER_PIN_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return res;
}

export async function requireOwnerPinVerified(
  req: Request,
  supabase: SupabaseLike,
  shopId: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const cookieShopId = getOwnerPinCookieFromRequest(req);

  if (!cookieShopId || cookieShopId !== shopId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Owner PIN required" }, { status: 401 }),
    };
  }

  const { data: shop, error } = await supabase
    .from("shops")
    .select("id")
    .eq("id", shopId)
    .single();

  if (error || !shop) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Shop not found" }, { status: 404 }),
    };
  }

  return { ok: true };
}

export function getRouteHandlerCookies() {
  return nextCookies;
}
