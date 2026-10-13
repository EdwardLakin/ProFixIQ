import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * `__Host-` makes the cookie host-only, Secure and Path=/, and stops sibling
 * subdomains from setting or shadowing it (no cookie tossing).
 */
export const HANDOFF_NONCE_COOKIE = "__Host-profixiq-handoff";
export const HANDOFF_NONCE_MAX_AGE_SECONDS = 300;

export const HANDOFF_NONCE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

export function createHandoffNonce(): string {
  return randomBytes(32).toString("base64url");
}

export function hashHandoffNonce(nonce: string): string {
  return createHash("sha256").update(nonce).digest("hex");
}

/** Constant-time check that the browser's nonce cookie matches `bind`. */
export function handoffNonceMatches(
  nonce: string | undefined,
  bind: string,
): boolean {
  if (!nonce) return false;
  const a = Buffer.from(hashHandoffNonce(nonce), "hex");
  const b = Buffer.from(bind, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
