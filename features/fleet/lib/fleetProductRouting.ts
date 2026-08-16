export const FLEET_PRODUCT_ORIGIN = "https://fleet.profixiq.com";

const FLEET_PRODUCT_HOSTNAMES = new Set([
  "fleet.profixiq.com",
  "fleet.localhost",
]);

type FleetRouteMapping = {
  publicPath: string;
  internalPath: string;
};

export type LegacyFleetRedirect = {
  destination: "fleet" | "shop";
  href: string;
};

const FLEET_ROUTE_MAPPINGS: readonly FleetRouteMapping[] = [
  {
    publicPath: "/requests/new",
    internalPath: "/portal/fleet/request/build",
  },
  {
    publicPath: "/pre-trips/start",
    internalPath: "/portal/fleet/pretrip",
  },
  { publicPath: "/updates", internalPath: "/portal/fleet/updates" },
  { publicPath: "/intake", internalPath: "/portal/fleet/intake" },
  {
    publicPath: "/requests",
    internalPath: "/portal/fleet/service-requests",
  },
  {
    publicPath: "/pre-trips",
    internalPath: "/portal/fleet/pretrip-history",
  },
  { publicPath: "/assets", internalPath: "/portal/fleet/units" },
  { publicPath: "/maintenance", internalPath: "/portal/fleet/maintenance" },
  { publicPath: "/calendar", internalPath: "/portal/fleet/calendar" },
  {
    publicPath: "/inspection-templates",
    internalPath: "/portal/fleet/inspection-templates",
  },
  { publicPath: "/drivers", internalPath: "/portal/fleet/drivers" },
  { publicPath: "/history", internalPath: "/portal/fleet/billing" },
  { publicPath: "/reports", internalPath: "/portal/fleet/reports" },
  { publicPath: "/settings", internalPath: "/portal/fleet/settings" },
  { publicPath: "/sign-in", internalPath: "/portal/auth/fleet-sign-in" },
  { publicPath: "/", internalPath: "/portal/fleet" },
] as const;

const FLEET_LEGACY_SIGN_IN_PATHS = new Set([
  "/portal/fleet/auth/sign-in",
  "/portal/fleet/auth/sign-in/",
]);

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed || trimmed === "/") return "/";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function replaceRouteBase(
  pathname: string,
  sourceBase: string,
  destinationBase: string,
): string | null {
  const normalized = normalizePathname(pathname);
  if (normalized === sourceBase) return destinationBase;
  if (
    sourceBase === "/" ||
    destinationBase === "/" ||
    !normalized.startsWith(`${sourceBase}/`)
  ) {
    return null;
  }
  return `${destinationBase}${normalized.slice(sourceBase.length)}`;
}

function mapFleetPathname(
  pathname: string,
  sourceKey: keyof FleetRouteMapping,
  destinationKey: keyof FleetRouteMapping,
): string | null {
  for (const mapping of FLEET_ROUTE_MAPPINGS) {
    const mapped = replaceRouteBase(
      pathname,
      mapping[sourceKey],
      mapping[destinationKey],
    );
    if (mapped) return mapped;
  }
  return null;
}

function mapFleetHref(
  href: string | null | undefined,
  mapper: (pathname: string) => string | null,
): string | null {
  const candidate = String(href ?? "").trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return null;

  const parsed = new URL(candidate, "https://fleet-routing.invalid");
  const mappedPathname = mapper(parsed.pathname);
  if (!mappedPathname) return null;
  return `${mappedPathname}${parsed.search}${parsed.hash}`;
}

function legacyFleetPath(pathname: string): string | null {
  const normalized = normalizePathname(pathname);
  if (
    normalized === "/fleet/portal-access" ||
    normalized === "/fleet/programs"
  ) {
    return null;
  }
  if (normalized === "/fleet/sign-in") return "/sign-in";
  if (normalized === "/fleet" || normalized === "/fleet/tower") return "/";
  if (normalized === "/fleet/dispatch") return "/";

  const intakeMatch = normalized.match(
    /^\/fleet\/work-orders\/([^/]+)\/intake$/,
  );
  if (intakeMatch?.[1]) {
    return `/history?workOrderId=${encodeURIComponent(intakeMatch[1])}`;
  }

  const mappings = [
    ["/fleet/service-requests/new", "/requests/new"],
    ["/fleet/service-requests", "/requests"],
    ["/fleet/pretrip-history", "/pre-trips"],
    ["/fleet/pretrip", "/pre-trips/start"],
    ["/fleet/assets", "/assets"],
    ["/fleet/units", "/assets"],
    ["/fleet/maintenance", "/maintenance"],
    ["/fleet/billing", "/history"],
  ] as const;

  for (const [legacyBase, publicBase] of mappings) {
    const mapped = replaceRouteBase(normalized, legacyBase, publicBase);
    if (mapped) return mapped;
  }

  return normalized.startsWith("/fleet/") ? "/" : null;
}

/**
 * Retire the old Shop-hosted Fleet workspace without breaking bookmarks.
 * Relationship creation/invitation remains in Shop; every operational path
 * moves to the clean Fleet product surface.
 */
export function resolveLegacyFleetRedirect(
  href: string | null | undefined,
): LegacyFleetRedirect | null {
  const candidate = String(href ?? "").trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return null;

  const parsed = new URL(candidate, "https://legacy-fleet.invalid");
  const pathname = normalizePathname(parsed.pathname);
  if (pathname === "/fleet/portal-access" || pathname === "/fleet/programs") {
    return {
      destination: "shop",
      href: `/dashboard/owner/fleet-access${parsed.search}${parsed.hash}`,
    };
  }

  const mapped = legacyFleetPath(pathname);
  if (!mapped) return null;

  const target = new URL(mapped, "https://fleet-routing.invalid");
  for (const [key, value] of parsed.searchParams) {
    if (!target.searchParams.has(key)) target.searchParams.append(key, value);
  }
  target.hash = parsed.hash;
  return {
    destination: "fleet",
    href: `${target.pathname}${target.search}${target.hash}`,
  };
}

export function normalizeRequestHostname(
  value: string | null | undefined,
): string {
  const forwardedHost = String(value ?? "")
    .split(",", 1)[0]
    .trim()
    .toLowerCase();
  if (!forwardedHost) return "";

  if (forwardedHost.startsWith("[")) {
    const closingBracket = forwardedHost.indexOf("]");
    return closingBracket >= 0
      ? forwardedHost.slice(0, closingBracket + 1)
      : forwardedHost;
  }

  return forwardedHost.split(":", 1)[0];
}

export function isFleetProductHostname(
  value: string | null | undefined,
): boolean {
  return FLEET_PRODUCT_HOSTNAMES.has(normalizeRequestHostname(value));
}

export function toFleetInternalPath(pathname: string): string | null {
  return mapFleetPathname(pathname, "publicPath", "internalPath");
}

export function toFleetPublicPath(pathname: string): string | null {
  if (FLEET_LEGACY_SIGN_IN_PATHS.has(pathname)) return "/sign-in";
  return mapFleetPathname(pathname, "internalPath", "publicPath");
}

export function toFleetInternalHref(
  href: string | null | undefined,
): string | null {
  return mapFleetHref(href, toFleetInternalPath);
}

export function toFleetPublicHref(
  href: string | null | undefined,
): string | null {
  return mapFleetHref(href, toFleetPublicPath);
}

export function isFleetProductSharedPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return (
    normalized === "/forgot-password" ||
    normalized === "/auth/reset" ||
    normalized === "/auth/set-password" ||
    normalized === "/auth/callback" ||
    normalized === "/confirm" ||
    normalized === "/robots.txt" ||
    normalized === "/sitemap.xml" ||
    normalized === "/fleet-manifest.webmanifest" ||
    normalized === "/api" ||
    normalized.startsWith("/api/")
  );
}
