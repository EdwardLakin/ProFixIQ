import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_EXPIRY_DAYS = 7;
const MAX_EXPIRY_DAYS = 7;
const MAX_TOKEN_LENGTH = 4096;
const MAX_ENCODED_PAYLOAD_LENGTH = 2048;
const MIN_SECRET_BYTES = 32;
const PREVIEW_TOKEN_VERSION = 1;
const PREVIEW_TOKEN_PURPOSE = "shop_boost_preview";
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ShopBoostPreviewTokenPayload = {
  version: typeof PREVIEW_TOKEN_VERSION;
  purpose: typeof PREVIEW_TOKEN_PURPOSE;
  demoId: string;
  intakeId: string;
  issuedAt: number;
  exp: number;
  senderName?: string;
};

function readSecret(): Buffer | null {
  const value = process.env.SHOP_BOOST_SHARE_SECRET?.trim();
  if (!value || Buffer.byteLength(value, "utf8") < MIN_SECRET_BYTES) return null;
  return Buffer.from(value, "utf8");
}

function requireSecret(): Buffer {
  const secret = readSecret();
  if (!secret) {
    throw new Error(
      "SHOP_BOOST_SHARE_SECRET must be configured with at least 32 bytes.",
    );
  }
  return secret;
}

export function assertShopBoostPreviewTokenConfigured(): void {
  requireSecret();
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string | null {
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) return null;
    return decoded.toString("utf8");
  } catch {
    return null;
  }
}

function sign(value: string, secret: Buffer): Buffer {
  return createHmac("sha256", secret).update(value).digest();
}

function hasValidPayloadShape(
  value: unknown,
  now: number,
): value is ShopBoostPreviewTokenPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  const senderName = payload.senderName;

  return (
    payload.version === PREVIEW_TOKEN_VERSION &&
    payload.purpose === PREVIEW_TOKEN_PURPOSE &&
    typeof payload.demoId === "string" &&
    UUID_PATTERN.test(payload.demoId) &&
    typeof payload.intakeId === "string" &&
    UUID_PATTERN.test(payload.intakeId) &&
    Number.isSafeInteger(payload.issuedAt) &&
    Number.isSafeInteger(payload.exp) &&
    (payload.issuedAt as number) <= now + CLOCK_SKEW_MS &&
    (payload.exp as number) > now &&
    (payload.exp as number) > (payload.issuedAt as number) &&
    (payload.exp as number) - (payload.issuedAt as number) <=
      MAX_EXPIRY_DAYS * DAY_MS &&
    (senderName === undefined ||
      (typeof senderName === "string" && senderName.length <= 80))
  );
}

export function generateShopBoostPreviewToken(args: {
  demoId: string;
  intakeId: string;
  senderName?: string;
  expiresInDays?: number;
}): string {
  if (!UUID_PATTERN.test(args.demoId) || !UUID_PATTERN.test(args.intakeId)) {
    throw new Error("Shop Boost preview identifiers are invalid.");
  }

  const expiresInDays = args.expiresInDays ?? DEFAULT_EXPIRY_DAYS;
  if (
    !Number.isFinite(expiresInDays) ||
    expiresInDays <= 0 ||
    expiresInDays > MAX_EXPIRY_DAYS
  ) {
    throw new Error("Shop Boost preview expiry is invalid.");
  }

  const now = Date.now();
  const senderName = args.senderName?.trim().slice(0, 80) || undefined;
  const payload: ShopBoostPreviewTokenPayload = {
    version: PREVIEW_TOKEN_VERSION,
    purpose: PREVIEW_TOKEN_PURPOSE,
    demoId: args.demoId,
    intakeId: args.intakeId,
    senderName,
    issuedAt: now,
    exp: now + Math.floor(expiresInDays * DAY_MS),
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, requireSecret()).toString("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyShopBoostPreviewToken(
  token: string,
): ShopBoostPreviewTokenPayload | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, encodedSignature] = parts;
  if (
    !encodedPayload ||
    !encodedSignature ||
    encodedPayload.length > MAX_ENCODED_PAYLOAD_LENGTH
  ) {
    return null;
  }

  const secret = readSecret();
  if (!secret) return null;

  let suppliedSignature: Buffer;
  try {
    suppliedSignature = Buffer.from(encodedSignature, "base64url");
    if (suppliedSignature.toString("base64url") !== encodedSignature) return null;
  } catch {
    return null;
  }

  const expectedSignature = sign(encodedPayload, secret);
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return null;
  }

  const decodedPayload = base64UrlDecode(encodedPayload);
  if (!decodedPayload) return null;

  try {
    const payload: unknown = JSON.parse(decodedPayload);
    return hasValidPayloadShape(payload, Date.now()) ? payload : null;
  } catch {
    return null;
  }
}

export function buildShopBoostShareHref(args: {
  origin: string;
  demoId: string;
  intakeId: string;
  senderName?: string;
  expiresInDays?: number;
}): string {
  const token = generateShopBoostPreviewToken({
    demoId: args.demoId,
    intakeId: args.intakeId,
    senderName: args.senderName,
    expiresInDays: args.expiresInDays,
  });

  const url = new URL(`/demo/preview/${args.demoId}`, args.origin);
  url.searchParams.set("share", "1");
  url.searchParams.set("token", token);
  return url.toString();
}
