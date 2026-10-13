import { FLEET_PRODUCT_ORIGIN } from "@/features/fleet/lib/fleetProductRouting";

/**
 * Cross-host session handoff. Auth cookies stay host-only; moving between the
 * primary site and the Fleet host mints a single-use Supabase OTP on the source
 * host and redeems it into a fresh host-only session on the target host.
 */

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

export function isValidHandoffTokenHash(raw: string | null): raw is string {
  return !!raw && TOKEN_HASH_PATTERN.test(raw);
}

/**
 * Redeeming logs the browser in, so refuse links that were not followed from
 * one of our own pages (login-CSRF). Fails closed when the header is absent.
 */
export function isTrustedHandoffNavigation(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  return site === "same-origin" || site === "same-site";
}

/** Relative link a page on the current host uses to leave it with its session. */
export function handoffStartHref(targetOrigin: string, nextPath: string): string {
  const params = new URLSearchParams({ target: targetOrigin, next: nextPath });
  return `${HANDOFF_START_PATH}?${params.toString()}`;
}
