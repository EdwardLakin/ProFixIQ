import { cookies as nextCookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export const OWNER_PIN_COOKIE_NAME = "pfq_owner_pin_shop";
export const OWNER_PIN_TTL_SECONDS = 60 * 30;
export const OWNER_PIN_TOKEN_SECRET_ENV = "OWNER_PIN_TOKEN_SECRET";

export const OWNER_PIN_PURPOSES = {
  PRIVILEGED: "owner_pin:privileged",
  SETTINGS: "owner_pin:settings",
  BILLING: "owner_pin:billing",
  BRANDING: "owner_pin:branding",
} as const;

export type OwnerPinPurpose = (typeof OWNER_PIN_PURPOSES)[keyof typeof OWNER_PIN_PURPOSES];

type OwnerPinTokenClaims = {
  sub: string;
  shop_id: string;
  purpose: OwnerPinPurpose;
  iat: number;
  exp: number;
  ver: 1;
};

type SupabaseLike = {
  auth: {
    getUser: () => Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
  from: (table: keyof DB["public"]["Tables"] | string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        single: () => Promise<{ data: any; error: any }>;
      };
    };
  };
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getOwnerPinTokenSecret(): string | null {
  const secret = process.env[OWNER_PIN_TOKEN_SECRET_ENV]?.trim();
  return secret ? secret : null;
}

function signOwnerPinToken(unsignedValue: string, secret: string): string {
  return createHmac("sha256", secret).update(unsignedValue).digest("base64url");
}

function safeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createOwnerPinToken(args: {
  userId: string;
  shopId: string;
  purpose: OwnerPinPurpose;
  ttlSeconds?: number;
  nowSeconds?: number;
}): string {
  const secret = getOwnerPinTokenSecret();
  if (!secret) {
    throw new Error(`${OWNER_PIN_TOKEN_SECRET_ENV} is required`);
  }

  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  const payload: OwnerPinTokenClaims = {
    sub: args.userId,
    shop_id: args.shopId,
    purpose: args.purpose,
    iat: now,
    exp: now + (args.ttlSeconds ?? OWNER_PIN_TTL_SECONDS),
    ver: 1,
  };
  const encodedHeader = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = signOwnerPinToken(unsigned, secret);
  return `${unsigned}.${signature}`;
}

export function verifyOwnerPinToken(token: string): { ok: true; claims: OwnerPinTokenClaims } | { ok: false } {
  try {
    const secret = getOwnerPinTokenSecret();
    if (!secret) return { ok: false };

    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false };

    const [encodedHeader, encodedPayload, signature] = parts;
    const unsigned = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = signOwnerPinToken(unsigned, secret);
    if (!safeEqualString(signature, expectedSignature)) return { ok: false };

    const parsedHeader = JSON.parse(base64UrlDecode(encodedHeader)) as { alg?: string; typ?: string };
    if (parsedHeader.alg !== "HS256" || parsedHeader.typ !== "JWT") return { ok: false };

    const claims = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<OwnerPinTokenClaims>;
    if (
      claims.ver !== 1 ||
      typeof claims.sub !== "string" ||
      typeof claims.shop_id !== "string" ||
      typeof claims.purpose !== "string" ||
      typeof claims.iat !== "number" ||
      typeof claims.exp !== "number"
    ) {
      return { ok: false };
    }

    if (claims.exp <= Math.floor(Date.now() / 1000)) return { ok: false };
    return { ok: true, claims: claims as OwnerPinTokenClaims };
  } catch {
    return { ok: false };
  }
}

export function getOwnerPinCookieFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie") ?? "";
  if (!cookieHeader) return null;

  const parts = cookieHeader.split(";").map((p) => p.trim());
  const match = parts.find((p) => p.startsWith(`${OWNER_PIN_COOKIE_NAME}=`));
  if (!match) return null;

  const value = match.slice(`${OWNER_PIN_COOKIE_NAME}=`.length);
  return decodeURIComponent(value || "");
}

export function setOwnerPinVerifiedCookie(
  res: NextResponse,
  args: { userId: string; shopId: string; purpose: OwnerPinPurpose }
) {
  const token = createOwnerPinToken(args);

  res.cookies.set(OWNER_PIN_COOKIE_NAME, token, {
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
  args: {
    shopId: string;
    userId: string;
    allowedPurposes: OwnerPinPurpose[];
  }
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const cookieToken = getOwnerPinCookieFromRequest(req);

  if (!cookieToken) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Owner PIN required" }, { status: 401 }),
    };
  }

  const verification = verifyOwnerPinToken(cookieToken);
  if (!verification.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Owner PIN required" }, { status: 401 }),
    };
  }

  if (verification.claims.sub !== args.userId || verification.claims.shop_id !== args.shopId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Owner PIN required" }, { status: 401 }),
    };
  }

  if (!args.allowedPurposes.includes(verification.claims.purpose)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Owner PIN purpose not allowed" }, { status: 403 }),
    };
  }

  const { data: currentUser, error: userErr } = await supabase.auth.getUser();
  if (userErr || !currentUser.user || currentUser.user.id !== args.userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  const { data: shop, error } = await supabase
    .from("shops")
    .select("id")
    .eq("id", args.shopId)
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
