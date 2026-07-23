const MOBILE_ORIGIN = "https://mobile.profixiq.local";

const NON_NAVIGATION_PROTOCOLS = [
  "mailto:",
  "tel:",
  "sms:",
  "javascript:",
] as const;

function withSuffix(pathname: string, search: string, hash: string): string {
  return `${pathname}${search}${hash}`;
}

function isPathAtOrBelow(pathname: string, route: string): boolean {
  const normalizedRoute = route.endsWith("/")
    ? route.replace(/\/+$/, "")
    : route;
  return (
    pathname === normalizedRoute || pathname.startsWith(`${normalizedRoute}/`)
  );
}

function firstPathSegmentAfter(pathname: string, prefix: string): string | null {
  const normalizedPrefix = prefix.endsWith("/")
    ? prefix.replace(/\/+$/, "")
    : prefix;
  if (!isPathAtOrBelow(pathname, normalizedPrefix)) return null;

  const remainder = pathname
    .slice(normalizedPrefix.length)
    .replace(/^\/+/, "");
  const segment = remainder.split("/")[0]?.trim();
  return segment || null;
}

function mapWorkOrderPath(
  pathname: string,
  searchParams: URLSearchParams,
): string {
  if (pathname === "/work-orders" || pathname === "/work-orders/") {
    return "/mobile/work-orders";
  }
  if (
    pathname === "/work-orders/view" ||
    pathname === "/work-orders/view/"
  ) {
    return "/mobile/work-orders";
  }
  if (
    pathname === "/work-orders/quote-review" ||
    pathname === "/work-orders/quote-review/"
  ) {
    const workOrderId = searchParams.get("woId")?.trim();
    return workOrderId
      ? `/mobile/work-orders/${encodeURIComponent(workOrderId)}`
      : "/mobile/work-orders";
  }
  if (isPathAtOrBelow(pathname, "/work-orders/board")) {
    return "/mobile/dispatch";
  }
  if (
    isPathAtOrBelow(pathname, "/work-orders/create") ||
    isPathAtOrBelow(pathname, "/work-orders/new")
  ) {
    return "/mobile/work-orders/create";
  }

  const viewId = firstPathSegmentAfter(pathname, "/work-orders/view");
  if (viewId) return `/mobile/work-orders/${viewId}`;

  const workOrderId = firstPathSegmentAfter(pathname, "/work-orders");
  return workOrderId
    ? `/mobile/work-orders/${workOrderId}`
    : "/mobile/work-orders";
}

function mapInspectionPath(pathname: string): string {
  if (isPathAtOrBelow(pathname, "/inspections/fleet-import")) {
    return "/mobile/inspections/import";
  }
  if (isPathAtOrBelow(pathname, "/inspections/fleet-review")) {
    return "/mobile/inspections/import";
  }
  if (isPathAtOrBelow(pathname, "/inspections/maintenance-50-air")) {
    return "/mobile/inspections/maintenance-50-air";
  }
  if (isPathAtOrBelow(pathname, "/inspections/maintenance-50")) {
    return "/mobile/inspections/maintenance-50";
  }

  const inspectionId = firstPathSegmentAfter(pathname, "/inspections");
  const nonRecordRoutes = new Set([
    "run",
    "fill",
    "templates",
    "builder",
    "maintenance",
  ]);

  return inspectionId && !nonRecordRoutes.has(inspectionId)
    ? `/mobile/inspections/${inspectionId}`
    : "/mobile/inspections";
}

function mapQuoteReviewPath(pathname: string): string {
  const workOrderId = firstPathSegmentAfter(pathname, "/quote-review");
  return workOrderId
    ? `/mobile/work-orders/${workOrderId}`
    : "/mobile/work-orders";
}

function mapMessagePath(pathname: string): string {
  const suffix = pathname.slice("/messages".length);
  return `/mobile/messages${suffix}`;
}

function mapCustomerPath(pathname: string): string {
  const customerId = firstPathSegmentAfter(pathname, "/customers");
  return customerId ? `/mobile/customers/${customerId}` : "/mobile/work-orders";
}

function mapFleetPath(pathname: string): string {
  if (isPathAtOrBelow(pathname, "/fleet/service-requests")) {
    return "/mobile/fleet/service-requests";
  }
  if (isPathAtOrBelow(pathname, "/fleet/pretrip")) {
    const unitId = firstPathSegmentAfter(pathname, "/fleet/pretrip");
    return unitId
      ? `/mobile/fleet/pretrip/${unitId}`
      : "/mobile/fleet/pretrip";
  }
  if (isPathAtOrBelow(pathname, "/fleet/assets")) {
    const unitId = firstPathSegmentAfter(pathname, "/fleet/assets");
    return unitId
      ? `/mobile/fleet?unit=${encodeURIComponent(unitId)}`
      : "/mobile/fleet";
  }
  return "/mobile/fleet";
}

function mapDashboardPath(pathname: string): string {
  if (isPathAtOrBelow(pathname, "/dashboard/workforce")) {
    return "/mobile/workforce/attendance";
  }
  if (
    isPathAtOrBelow(pathname, "/dashboard/admin/people") ||
    isPathAtOrBelow(pathname, "/dashboard/admin/employees") ||
    isPathAtOrBelow(pathname, "/dashboard/technicians")
  ) {
    return "/mobile/technicians";
  }
  if (isPathAtOrBelow(pathname, "/dashboard/appointments")) {
    return "/mobile/appointments";
  }
  if (isPathAtOrBelow(pathname, "/dashboard/reports")) {
    return "/mobile/reports";
  }
  return "/mobile";
}

/**
 * Resolves a known ProFixIQ application route to its mobile-native counterpart.
 * External URLs, hashes, API routes, portal routes, and shared auth routes return
 * null so the caller can leave them alone.
 */
export function resolveMobileHref(rawHref: string | null | undefined): string | null {
  const href = String(rawHref ?? "").trim();
  if (!href || href === "#") return null;
  if (
    NON_NAVIGATION_PROTOCOLS.some((protocol) =>
      href.toLowerCase().startsWith(protocol),
    )
  ) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(href, MOBILE_ORIGIN);
  } catch {
    return null;
  }

  if (parsed.origin !== MOBILE_ORIGIN) return null;

  const { pathname, hash } = parsed;
  let search = parsed.search;
  if (isPathAtOrBelow(pathname, "/mobile")) {
    return withSuffix(pathname, search, hash);
  }

  let mobilePath: string | null = null;

  if (pathname === "/" || isPathAtOrBelow(pathname, "/dashboard")) {
    mobilePath = pathname === "/" ? "/mobile" : mapDashboardPath(pathname);
  } else if (isPathAtOrBelow(pathname, "/work-orders")) {
    mobilePath = mapWorkOrderPath(pathname, parsed.searchParams);
    if (
      (pathname === "/work-orders/quote-review" ||
        pathname === "/work-orders/quote-review/") &&
      parsed.searchParams.has("woId")
    ) {
      parsed.searchParams.delete("woId");
      search = parsed.search;
    }
  } else if (isPathAtOrBelow(pathname, "/quote-review")) {
    mobilePath = mapQuoteReviewPath(pathname);
  } else if (isPathAtOrBelow(pathname, "/tech/queue")) {
    mobilePath = "/mobile/tech/queue";
  } else if (isPathAtOrBelow(pathname, "/tech/performance")) {
    mobilePath = "/mobile/tech/performance";
  } else if (isPathAtOrBelow(pathname, "/appointments")) {
    mobilePath = "/mobile/appointments";
  } else if (isPathAtOrBelow(pathname, "/inspections")) {
    mobilePath = mapInspectionPath(pathname);
  } else if (isPathAtOrBelow(pathname, "/parts")) {
    mobilePath = "/mobile/parts";
  } else if (isPathAtOrBelow(pathname, "/messages")) {
    mobilePath = mapMessagePath(pathname);
  } else if (isPathAtOrBelow(pathname, "/customers")) {
    mobilePath = mapCustomerPath(pathname);
  } else if (isPathAtOrBelow(pathname, "/fleet")) {
    mobilePath = mapFleetPath(pathname);
  } else if (isPathAtOrBelow(pathname, "/offline")) {
    mobilePath = "/mobile/offline";
  } else if (
    isPathAtOrBelow(pathname, "/assistant") ||
    isPathAtOrBelow(pathname, "/ai/assistant")
  ) {
    mobilePath = "/mobile/assistant";
  } else if (isPathAtOrBelow(pathname, "/agent/planner")) {
    mobilePath = "/mobile/planner";
  } else if (isPathAtOrBelow(pathname, "/settings")) {
    mobilePath = "/mobile/settings";
  } else if (isPathAtOrBelow(pathname, "/reports")) {
    mobilePath = "/mobile/reports";
  } else if (isPathAtOrBelow(pathname, "/technicians")) {
    mobilePath = "/mobile/technicians";
  } else if (pathname === "/sign-in") {
    mobilePath = "/mobile/sign-in";
  }

  if (!mobilePath) return null;

  // Some mobile mappings already include their own query string.
  if (mobilePath.includes("?")) {
    const [mappedPath, mappedQuery] = mobilePath.split("?", 2);
    const merged = new URLSearchParams(mappedQuery);
    parsed.searchParams.forEach((value, key) => merged.set(key, value));
    const query = merged.toString();
    return `${mappedPath}${query ? `?${query}` : ""}${hash}`;
  }

  return withSuffix(mobilePath, search, hash);
}

export function requireMobileHref(rawHref: string): string {
  return resolveMobileHref(rawHref) ?? "/mobile";
}
