import crypto from "crypto";
import { getQuickBooksStateSecret } from "./env";

export type QuickBooksOAuthState = {
  shopId: string;
  userId: string;
  issuedAt: number;
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sign(payload: string): string {
  return base64url(
    crypto.createHmac("sha256", getQuickBooksStateSecret()).update(payload).digest(),
  );
}

export function encodeQuickBooksState(value: QuickBooksOAuthState): string {
  const payload = base64url(JSON.stringify(value));
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function decodeQuickBooksState(
  input: string,
): QuickBooksOAuthState | null {
  const [payload, signature] = input.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64").toString("utf8"),
    ) as QuickBooksOAuthState;

    if (!parsed.shopId || !parsed.userId || !parsed.issuedAt) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}