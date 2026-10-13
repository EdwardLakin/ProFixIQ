import { FLEET_PRODUCT_ORIGIN } from "@/features/fleet/lib/fleetProductRouting";

/**
 * Cross-host session handoff. Auth cookies stay host-only; moving between the
 * primary site and the Fleet host mints a single-use Supabase OTP on the source
 * host and redeems it into a fresh host-only session on the target host.
 */

export const HANDOFF_BEGIN_PATH = "/api/auth/handoff/begin";
export const HANDOFF_START_PATH = "/api/auth/handoff/start";
export const HANDOFF_REDEEM_PATH = "/api/auth/handoff/redeem";

const PRIMARY_SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://profixiq.com";

const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{8,256}$/;

export function allowedHandoffOrigins(): readonly string[] {
  return [PRIMARY_SITE_ORIGIN, FLEET_PRODUCT_ORIGIN];
}

/** Exact-match allowlist; anything else (including look-alikes) is rejected. */
export function resolveHandoffTarget(raw: string | null): string | null {
  if (!raw) return null;
  return allowedHandoffOrigins().find((origin) => origin === raw) ?? null;
}

/** Same-origin absolute paths only, and never back into the handoff routes. */
export function safeHandoffPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  if (raw.startsWith("/api/auth/handoff")) return null;
  return raw;
}

/** Hex SHA-256 of the target-host nonce; carried through the source host. */
export function isValidHandoffBind(raw: string | null): raw is string {
  return !!raw && /^[a-f0-9]{64}$/.test(raw);
}

export function isValidHandoffTokenHash(raw: string | null): raw is string {
  return !!raw && TOKEN_HASH_PATTERN.test(raw);
}

/**
 * Handoff routes have side effects (they mint or redeem sessions), so only a
 * top-level navigation that began on one of our own origins is acceptable:
 * embeds (img, iframe, fetch) and cross-site links are refused. Fails closed
 * when fetch metadata is absent.
 */
export function isTrustedHandoffNavigation(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  return (
    (site === "same-origin" || site === "same-site") &&
    headers.get("sec-fetch-mode") === "navigate" &&
    headers.get("sec-fetch-dest") === "document"
  );
}

/**
 * Where every failed handoff goes. Never the requested workspace: the target
 * host may hold a different account's session, and silently opening a
 * protected page under it would be the wrong tenant.
 */
export function handoffFailureUrl(origin: string): string {
  return `${origin}/sign-in?access=handoff_failed`;
}

/**
 * Link a page on `sourceOrigin` uses to enter `targetOrigin` with its session.
 * It begins on the TARGET so the target can bind the handoff to this browser
 * before the source mints anything. Render it as a plain `<a>` (never a
 * prefetched router Link): visiting it has side effects.
 */
export function handoffBeginHref(
  targetOrigin: string,
  sourceOrigin: string,
  nextPath: string,
): string {
  const params = new URLSearchParams({ source: sourceOrigin, next: nextPath });
  return `${targetOrigin}${HANDOFF_BEGIN_PATH}?${params.toString()}`;
}

export function isHandoffHref(href: string): boolean {
  return href.includes("/api/auth/handoff/");
}
