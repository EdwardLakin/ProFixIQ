export const PRIVATE_NAVIGATION_CACHE_CLEAR_MESSAGE =
  "PROFIXIQ_CLEAR_PRIVATE_NAVIGATION_CACHES";

export const PRIVATE_NAVIGATION_REUSABLE_HEADER =
  "x-profixiq-offline-shell";

export const PRIVATE_NAVIGATION_CACHE_NAMES = {
  advisor: "profixiq-advisor-shell-v2",
  messaging: "profixiq-messaging-shell-v2",
  technician: "profixiq-technician-shell-v2",
} as const;

export const LEGACY_PRIVATE_NAVIGATION_CACHE_NAMES = [
  "profixiq-advisor-shell-v1",
  "profixiq-messaging-shell-v1",
  "profixiq-technician-shell-v1",
] as const;

const PRIVATE_CACHE_CONTROL = /(?:^|,)\s*(?:private|no-store)(?:\s*(?:=|,|$))/i;
const PERSONALIZED_VARY_HEADER = /(?:^|,)\s*(?:authorization|cookie|\*)(?:\s*(?:,|$))/i;

function containsSerializedSession(body: string): boolean {
  const normalized = body.toLowerCase();
  const hasTokenPair =
    normalized.includes("access_token") &&
    normalized.includes("refresh_token");
  const hasSupabaseAuthCookie =
    normalized.includes("sb-") && normalized.includes("-auth-token");
  return hasTokenPair || hasSupabaseAuthCookie;
}

/**
 * Authenticated Next.js HTML can contain a serialized Supabase session. A
 * navigation shell is cacheable only when the response is explicitly safe to
 * reuse on a shared browser and its body contains no session material.
 */
export async function isSafePrivateNavigationShell(
  response: Response,
): Promise<boolean> {
  if (!response.ok || response.type === "opaque") return false;

  // Authenticated HTML is private by default. Only an intentionally generic
  // shell may opt in; a missing cache header must never become implicit
  // permission to persist a personalized response on a shared device.
  if (
    response.headers
      .get(PRIVATE_NAVIGATION_REUSABLE_HEADER)
      ?.trim()
      .toLowerCase() !== "reusable"
  ) {
    return false;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html")) return false;

  const cacheControl = response.headers.get("cache-control") ?? "";
  if (PRIVATE_CACHE_CONTROL.test(cacheControl)) return false;

  const vary = response.headers.get("vary") ?? "";
  if (PERSONALIZED_VARY_HEADER.test(vary)) return false;

  try {
    return !containsSerializedSession(await response.clone().text());
  } catch {
    return false;
  }
}

export async function clearPrivateNavigationCaches(options?: {
  includeCurrent?: boolean;
}): Promise<void> {
  if (typeof caches === "undefined") return;
  const names = [
    ...LEGACY_PRIVATE_NAVIGATION_CACHE_NAMES,
    ...(options?.includeCurrent === false
      ? []
      : Object.values(PRIVATE_NAVIGATION_CACHE_NAMES)),
  ];
  await Promise.all(
    names.map((name) => caches.delete(name).catch(() => false)),
  );
}
