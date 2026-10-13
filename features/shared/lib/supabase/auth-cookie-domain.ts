/**
 * Shared auth-cookie domain so one Supabase session works across the product
 * hosts (profixiq.com, fleet.profixiq.com, ...).
 *
 * Opt-in: set NEXT_PUBLIC_AUTH_COOKIE_DOMAIN (e.g. ".profixiq.com"). When unset
 * (localhost, previews, tests) cookies stay host-only, exactly as before.
 */

const COOKIE_DOMAIN_PATTERN = /^\.?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export function readAuthCookieDomain(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN?.trim().toLowerCase();
  if (!raw || !COOKIE_DOMAIN_PATTERN.test(raw)) return undefined;
  return raw.startsWith(".") ? raw : `.${raw}`;
}

/** True when `hostname` is the cookie domain or one of its subdomains. */
export function hostnameMatchesAuthCookieDomain(
  hostname: string,
  domain: string | undefined = readAuthCookieDomain(),
): boolean {
  if (!domain) return false;
  const host = hostname.toLowerCase();
  const bare = domain.slice(1);
  return host === bare || host.endsWith(domain);
}

export function withAuthCookieDomain<T extends object>(
  options?: T,
): (T & { domain?: string }) | undefined {
  const domain = readAuthCookieDomain();
  if (!domain) return options;
  return { ...(options ?? ({} as T)), domain };
}

/**
 * Sessions created before the shared domain existed live in host-only cookies,
 * which would shadow the shared ones. Copy them to the shared domain, then
 * expire the host-only copy. Browser only; a no-op when the domain is unset or
 * does not cover the current host.
 */
export function migrateHostOnlyAuthCookies(): void {
  const domain = readAuthCookieDomain();
  if (!domain || typeof document === "undefined") return;
  if (!hostnameMatchesAuthCookieDomain(window.location.hostname, domain)) return;

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  for (const pair of document.cookie.split("; ")) {
    const eq = pair.indexOf("=");
    if (eq < 1) continue;
    const name = pair.slice(0, eq);
    if (!/^sb-.+-auth-token(\.\d+)?$/.test(name)) continue;
    const value = pair.slice(eq + 1);
    // Cannot tell host-only from shared copies via document.cookie, so write
    // the shared copy first, then expire only the host-only (no Domain) one.
    document.cookie = `${name}=${value}; Domain=${domain}; Path=/; Max-Age=34560000; SameSite=Lax${secure}`;
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  }
}
