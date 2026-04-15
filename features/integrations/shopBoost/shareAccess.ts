import crypto from "crypto";

const DEFAULT_EXPIRY_DAYS = 7;

export type ShareTokenPayload = {
  demoId: string;
  intakeId: string;
  exp: number;
  senderName?: string;
  issuedAt: string;
};

function getSecret(): string {
  return process.env.SHOP_BOOST_SHARE_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "profixiq-shop-boost-share";
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string): string {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function generateShopBoostShareToken(args: {
  demoId: string;
  intakeId: string;
  senderName?: string;
  expiresInDays?: number;
}): string {
  const now = Date.now();
  const payload: ShareTokenPayload = {
    demoId: args.demoId,
    intakeId: args.intakeId,
    senderName: args.senderName,
    issuedAt: new Date(now).toISOString(),
    exp: now + (args.expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60 * 1000,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyShopBoostShareToken(token: string): ShareTokenPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expected = sign(encodedPayload);
  if (expected !== signature) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as ShareTokenPayload;
    if (!payload.demoId || !payload.intakeId || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
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
  const token = generateShopBoostShareToken({
    demoId: args.demoId,
    intakeId: args.intakeId,
    senderName: args.senderName,
    expiresInDays: args.expiresInDays,
  });

  const url = new URL(`/demo/preview/${args.demoId}`, args.origin);
  url.searchParams.set("intakeId", args.intakeId);
  url.searchParams.set("share", "1");
  url.searchParams.set("token", token);
  return url.toString();
}
